import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAction, useMutation } from 'convex/react'
import { MicIcon, MicOffIcon, PhoneOffIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { Portrait } from '../../convex/lib/portraits'
import { BotAvatar } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { errorMessage } from '~/lib/errors'

type Status =
  'idle' | 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking'

/** Loudness (RMS) above which the microphone counts as someone talking. */
const SPEECH_LEVEL = 0.035
/** This much quiet after talking ends the turn. */
const END_SILENCE_MS = 900
const MAX_TURN_MS = 30_000
/** A turn with no talking restarts after this, so recordings stay small. */
const IDLE_RESTART_MS = 15_000

/** Who the call is with. `threadId` fills in when the first turn starts a chat. */
export type CallTarget = {
  projectId: Id<'projects'>
  botId?: Id<'bots'>
  threadId?: string
}

type Session = CallTarget & {
  stream: MediaStream
  audio: AudioContext
  analyser: AnalyserNode
  recorder?: MediaRecorder
  playing?: AudioBufferSourceNode
  frame?: number
  /** The call's record in history, from its first turn or the answered ring. */
  callId?: Id<'calls'>
  ended: boolean
}

type Line = { who: 'you' | 'them'; text: string }

/** What an assistant says first when it called you, still loading when the call starts. */
type Opening = Promise<{
  text: string
  audioUrl: string | null
  callId?: Id<'calls'>
} | null>

/**
 * A voice call with one assistant: listen until the user stops talking, send
 * the clip as one turn, play the spoken reply, then listen again. Start it
 * from a click, so the browser allows the microphone and audio playback.
 */
export function useVoiceCall({
  onThread,
}: {
  /** Called when the first turn starts a new chat. */
  onThread?: (target: CallTarget & { threadId: string }) => void
} = {}) {
  const [status, setStatus] = React.useState<Status>('idle')
  const [error, setError] = React.useState<string>()
  const [muted, setMuted] = React.useState(false)
  const [lines, setLines] = React.useState<Array<Line>>([])
  const session = React.useRef<Session | null>(null)
  const uploadUrl = useMutation(api.api.chat.voiceUploadUrl)
  const turn = useAction(api.api.calls.turn)
  const end = useMutation(api.api.calls.end)

  function listen(s: Session) {
    if (s.ended) return
    const recorder = new MediaRecorder(s.stream)
    const chunks: Array<Blob> = []
    const began = performance.now()
    let heardAt = 0
    let lastVoice = 0
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.onstop = () => {
      if (s.ended) return
      if (heardAt) void send(s, new Blob(chunks, { type: recorder.mimeType }))
      else listen(s)
    }
    recorder.start()
    s.recorder = recorder
    setStatus('listening')
    const samples = new Float32Array(s.analyser.fftSize)
    const tick = () => {
      if (s.ended || recorder.state !== 'recording') return
      s.analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const x of samples) sum += x * x
      const level = Math.sqrt(sum / samples.length)
      const now = performance.now()
      if (level > SPEECH_LEVEL) {
        if (!heardAt) {
          heardAt = now
          setStatus('hearing')
        }
        lastVoice = now
      }
      const finished =
        heardAt > 0 &&
        (now - lastVoice > END_SILENCE_MS || now - heardAt > MAX_TURN_MS)
      if (finished || (!heardAt && now - began > IDLE_RESTART_MS)) {
        recorder.stop()
        return
      }
      s.frame = requestAnimationFrame(tick)
    }
    s.frame = requestAnimationFrame(tick)
  }

  async function send(s: Session, clip: Blob) {
    setStatus('thinking')
    try {
      const res = await fetch(await uploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': clip.type },
        body: clip,
      })
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      const result = await turn({
        projectId: s.projectId,
        botId: s.botId,
        threadId: s.threadId,
        storageId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        callId: s.callId,
      })
      // The user may have hung up while we waited.
      if (session.current !== s) return
      setError(undefined)
      s.callId = result.callId ?? s.callId
      if (result.threadId && result.threadId !== s.threadId) {
        s.threadId = result.threadId
        onThread?.({
          projectId: s.projectId,
          botId: s.botId,
          threadId: result.threadId,
        })
      }
      const said = result.transcript
      const reply = result.reply
      if (said) setLines((l) => [...l, { who: 'you', text: said }])
      if (reply) setLines((l) => [...l, { who: 'them', text: reply }])
      if (result.audioUrl) await play(s, result.audioUrl)
      else listen(s)
    } catch (e) {
      setError(errorMessage(e, "Couldn't reach the assistant. Try again."))
      listen(s)
    }
  }

  /** Plays a spoken reply, then listens again. */
  async function play(s: Session, audioUrl: string) {
    const sound = await (await fetch(audioUrl)).arrayBuffer()
    const buffer = await s.audio.decodeAudioData(sound)
    // The user may have hung up while it loaded.
    if (session.current !== s) return
    const source = s.audio.createBufferSource()
    source.buffer = buffer
    source.connect(s.audio.destination)
    source.onended = () => {
      s.playing = undefined
      listen(s)
    }
    s.playing = source
    setStatus('speaking')
    source.start()
  }

  /**
   * Starts a call with `target`. `opening` is what the assistant says first
   * when it called you; it can still be loading, since the call must start
   * in the click.
   */
  async function start(target: CallTarget, opening?: Opening) {
    if (session.current) return
    setError(undefined)
    setLines([])
    setStatus('starting')
    // Created in the click, so the browser lets it play audio later.
    const audio = new AudioContext()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      const analyser = audio.createAnalyser()
      analyser.fftSize = 1024
      audio.createMediaStreamSource(stream).connect(analyser)
      const s: Session = { ...target, stream, audio, analyser, ended: false }
      session.current = s
      const first = await opening?.catch(() => null)
      if (session.current !== s) return
      if (first) setLines([{ who: 'them', text: first.text }])
      s.callId = first?.callId
      if (first?.audioUrl) await play(s, first.audioUrl).catch(() => listen(s))
      else listen(s)
    } catch {
      void audio.close()
      setError('Allow microphone access to call.')
      setStatus('idle')
    }
  }

  /** Ends the call, or closes the screen when the call never started. */
  function hangUp() {
    setError(undefined)
    const s = session.current
    if (!s) return
    s.ended = true
    if (s.callId) void end({ id: s.callId })
    if (s.frame) cancelAnimationFrame(s.frame)
    if (s.recorder?.state === 'recording') s.recorder.stop()
    s.playing?.stop()
    for (const track of s.stream.getTracks()) track.stop()
    void s.audio.close()
    session.current = null
    setStatus('idle')
    setMuted(false)
  }

  function toggleMute() {
    const s = session.current
    if (!s) return
    for (const track of s.stream.getAudioTracks()) track.enabled = muted
    setMuted(!muted)
  }

  return { status, error, muted, lines, start, hangUp, toggleMute }
}

const STATUS_LABEL: Record<Status, string> = {
  idle: '',
  starting: 'Connecting…',
  listening: 'Listening…',
  hearing: 'Hearing you…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
}

type Caller = { name: string; portrait: Portrait }

const CallContext = React.createContext<{
  call: ReturnType<typeof useVoiceCall>
  /** Who the call is with, kept from the start, since the page can change during the call. */
  caller?: Caller
  /** Starts a call unless one is on. Call it from a click. */
  startCall: (target: CallTarget, caller: Caller, opening?: Opening) => void
} | null>(null)

/** The app's one call, so a ring can't start a second call over the first. `CallPanel` shows it. */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [caller, setCaller] = React.useState<Caller>()
  const call = useVoiceCall({
    onThread: ({ projectId, botId, threadId }) =>
      void navigate({
        to: '/p/$projectId',
        params: { projectId },
        search: (prev) => ({ ...prev, thread: threadId, bot: botId }),
      }),
  })
  function startCall(target: CallTarget, who: Caller, opening?: Opening) {
    if (call.status !== 'idle') return
    setCaller(who)
    void call.start(target, opening)
  }
  return (
    <CallContext.Provider value={{ call, caller, startCall }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const context = React.useContext(CallContext)
  if (!context) throw new Error('useCall needs a CallProvider above it.')
  return context
}

/**
 * The call, docked at the side of the app: who it's with, what's happening,
 * and everything said so far. Full screen on phones.
 */
export function CallPanel() {
  const { call, caller } = useCall()
  if (!caller || (call.status === 'idle' && !call.error)) return null
  const live = call.status === 'speaking' || call.status === 'hearing'
  return (
    <aside
      role="dialog"
      aria-label={`Call with ${caller.name}`}
      className="fixed inset-0 z-40 flex flex-col bg-background md:sticky md:top-0 md:h-svh md:w-80 md:shrink-0 md:border-l lg:w-96"
    >
      <div className="flex items-center gap-3 border-b p-4">
        <div
          className={`rounded-[28%] p-1 ${
            live
              ? call.status === 'speaking'
                ? 'animate-pulse ring-2 ring-emerald-400/70'
                : 'ring-2 ring-sky-400/70'
              : 'ring-2 ring-transparent'
          }`}
        >
          <BotAvatar portrait={caller.portrait} className="size-12" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{caller.name}</p>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {call.muted ? 'Muted' : STATUS_LABEL[call.status]}
          </p>
        </div>
      </div>
      <ol
        aria-label="Transcript"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm"
      >
        {call.lines.length === 0 && !call.error && (
          <li className="text-muted-foreground">
            What you and {caller.name} say shows up here.
          </li>
        )}
        {call.lines.map((line, i) => (
          <li
            key={i}
            ref={i === call.lines.length - 1 ? scrollIntoView : undefined}
            className={
              line.who === 'you'
                ? 'max-w-[85%] self-end rounded-2xl bg-muted px-3 py-2'
                : 'max-w-[85%]'
            }
          >
            {line.text}
          </li>
        ))}
        {call.error && (
          <li role="alert" className="text-destructive">
            {call.error}
          </li>
        )}
      </ol>
      <div className="flex justify-center gap-4 border-t p-4">
        <Button
          variant="outline"
          className="size-12 rounded-full"
          aria-label={call.muted ? 'Unmute' : 'Mute'}
          disabled={call.status === 'idle' || call.status === 'starting'}
          aria-pressed={call.muted}
          onClick={call.toggleMute}
        >
          {call.muted ? <MicOffIcon /> : <MicIcon />}
        </Button>
        <Button
          variant="destructive"
          className="size-12 rounded-full"
          aria-label="Hang up"
          onClick={call.hangUp}
        >
          <PhoneOffIcon />
        </Button>
      </div>
    </aside>
  )
}

/** Keeps the newest line in view as the transcript grows. */
function scrollIntoView(element: HTMLLIElement | null) {
  element?.scrollIntoView({ block: 'nearest' })
}
