import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAction, useConvex, useMutation } from 'convex/react'
import { MicIcon, MicOffIcon, PhoneOffIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { Portrait } from '../../convex/lib/portraits'
import { BotAvatar } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { errorMessage } from '~/lib/errors'
import { hear, startListening } from '~/lib/turn-taking'

type Status =
  'idle' | 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking'

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
  /** The assistant's reply while it arrives and plays. */
  reply?: Reply
  frame?: number
  /** The call's record in history, from its first turn or the answered ring. */
  callId?: Id<'calls'>
  ended: boolean
}

/** A spoken reply arriving a piece at a time, played in order as each piece is ready. */
type Reply = {
  /** Each piece's audio, decoding or decoded (null if it couldn't be). */
  pieces: Array<Promise<AudioBuffer | null>>
  /** The next piece to play. */
  next: number
  /** Every piece is in. */
  done: boolean
  playing?: {
    source: AudioBufferSourceNode
    buffer: AudioBuffer
    startedAt: number
  }
  /** On hold while you talk over it: where it stopped in the current piece. */
  paused?: { offset: number }
  stopWatching: () => void
}

type Line = {
  who: 'you' | 'them'
  text: string
  /** You talked over this reply before it finished. */
  cutOff?: boolean
}

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
  const convex = useConvex()
  const uploadUrl = useMutation(api.api.chat.voiceUploadUrl)
  const turn = useAction(api.api.calls.turn)
  const end = useMutation(api.api.calls.end)

  /**
   * Records until your turn is done, deciding from the mic's loudness (see
   * `hear`). It also runs while a reply arrives and plays, so talking over the
   * assistant pauses it: an "mm-hm" lets it carry on, more makes it your turn.
   */
  function listen(s: Session) {
    if (s.ended || s.recorder?.state === 'recording') return
    const recorder = new MediaRecorder(s.stream)
    const chunks: Array<Blob> = []
    let state = startListening(performance.now())
    let outcome: 'send' | 'resume' | 'restart' = 'restart'
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.onstop = () => {
      if (s.ended) return
      if (outcome === 'send') {
        const reply = s.reply
        const cutOff = !!reply && (reply.next > 0 || !!reply.paused?.offset)
        drop(s)
        void send(s, new Blob(chunks, { type: recorder.mimeType }), cutOff)
      } else if (outcome === 'resume') {
        resume(s)
        listen(s)
      } else listen(s)
    }
    recorder.start()
    s.recorder = recorder
    if (!s.reply) setStatus('listening')
    const samples = new Float32Array(s.analyser.fftSize)
    const tick = () => {
      if (s.ended || recorder.state !== 'recording') return
      s.analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const x of samples) sum += x * x
      const { next, event } = hear(state, {
        level: Math.sqrt(sum / samples.length),
        now: performance.now(),
        replying: s.reply !== undefined && !s.reply.paused,
        paused: s.reply?.paused !== undefined,
      })
      state = next
      if (event === 'hearing') setStatus('hearing')
      if (event === 'pause') {
        pause(s)
        setStatus('hearing')
      }
      if (event === 'send' || event === 'resume' || event === 'restart') {
        outcome = event
        recorder.stop()
        return
      }
      s.frame = requestAnimationFrame(tick)
    }
    s.frame = requestAnimationFrame(tick)
  }

  async function send(s: Session, clip: Blob, cutOff: boolean) {
    setStatus('thinking')
    if (cutOff) {
      setLines((l) => {
        const last = l.map((line) => line.who).lastIndexOf('them')
        return l.map((line, i) => (i === last ? { ...line, cutOff } : line))
      })
    }
    try {
      const res = await fetch(await uploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': clip.type },
        body: clip,
      })
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      const liveKey = crypto.randomUUID()
      follow(s, liveKey)
      listen(s)
      const result = await turn({
        projectId: s.projectId,
        botId: s.botId,
        threadId: s.threadId,
        storageId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        callId: s.callId,
        interrupted: cutOff || undefined,
        liveKey,
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
    } catch (e) {
      setError(errorMessage(e, "Couldn't reach the assistant. Try again."))
      drop(s)
      listen(s)
    }
  }

  /**
   * Watches the live turn `key` as the server fills it: shows what you said
   * and the reply so far, and queues each spoken piece to play in order.
   */
  function follow(s: Session, key: string) {
    const watch = convex.watchQuery(api.api.calls.live, { key })
    const reply: Reply = {
      pieces: [],
      next: 0,
      done: false,
      stopWatching: () => {},
    }
    let heardShown = false
    let replyShown = false
    const update = () => {
      if (s.reply !== reply) return
      let state
      try {
        state = watch.localQueryResult()
      } catch {
        return
      }
      if (!state) return
      const heard = state.heard
      if (heard && !heardShown) {
        heardShown = true
        setLines((l) => [...l, { who: 'you', text: heard }])
      }
      for (const piece of state.pieces.slice(reply.pieces.length)) {
        reply.pieces.push(decode(s, piece.url))
      }
      const text = state.pieces.map((piece) => piece.text).join(' ')
      if (text) {
        const shown = replyShown
        replyShown = true
        setLines((l) =>
          shown
            ? [...l.slice(0, -1), { who: 'them', text }]
            : [...l, { who: 'them', text }],
        )
      }
      if (state.done) {
        reply.done = true
        reply.stopWatching()
      }
      playNext(s)
    }
    reply.stopWatching = watch.onUpdate(update)
    s.reply = reply
    update()
  }

  async function decode(s: Session, url: string) {
    try {
      const sound = await (await fetch(url)).arrayBuffer()
      return await s.audio.decodeAudioData(sound)
    } catch {
      return null
    }
  }

  /** Plays the reply's next piece once it's ready, or finishes the reply when every piece has played. */
  function playNext(s: Session) {
    const reply = s.reply
    if (!reply || reply.playing || reply.paused || s.ended) return
    const index = reply.next
    if (index >= reply.pieces.length) {
      if (reply.done) {
        s.reply = undefined
        setStatus('listening')
      }
      return
    }
    void reply.pieces[index]?.then((buffer) => {
      if (s.reply !== reply || reply.playing || reply.paused) return
      if (reply.next !== index) return
      if (buffer) play(s, reply, buffer, 0)
      else {
        reply.next++
        playNext(s)
      }
    })
  }

  function play(s: Session, reply: Reply, buffer: AudioBuffer, offset: number) {
    const source = s.audio.createBufferSource()
    source.buffer = buffer
    source.connect(s.audio.destination)
    source.onended = () => {
      // Not when paused or hung up: those clear `playing` first.
      if (reply.playing?.source !== source) return
      reply.playing = undefined
      reply.next++
      playNext(s)
    }
    reply.playing = { source, buffer, startedAt: s.audio.currentTime - offset }
    setStatus('speaking')
    source.start(0, offset)
  }

  function pause(s: Session) {
    const reply = s.reply
    if (!reply) return
    const playing = reply.playing
    reply.paused = {
      offset: playing ? s.audio.currentTime - playing.startedAt : 0,
    }
    reply.playing = undefined
    playing?.source.stop()
  }

  /** Carries on with the paused reply from where it stopped. */
  function resume(s: Session) {
    const reply = s.reply
    if (!reply?.paused) return
    const { offset } = reply.paused
    reply.paused = undefined
    setStatus('thinking')
    if (!offset) return playNext(s)
    void reply.pieces[reply.next]?.then((buffer) => {
      if (buffer && s.reply === reply && !reply.playing && !reply.paused) {
        play(s, reply, buffer, offset)
      }
    })
  }

  /** Stops the reply and stops waiting for the rest of it. */
  function drop(s: Session) {
    const reply = s.reply
    if (!reply) return
    s.reply = undefined
    reply.stopWatching()
    const playing = reply.playing
    reply.playing = undefined
    playing?.source.stop()
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
      if (first?.audioUrl) {
        s.reply = {
          pieces: [decode(s, first.audioUrl)],
          next: 0,
          done: true,
          stopWatching: () => {},
        }
      }
      listen(s)
      playNext(s)
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
    drop(s)
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
            {line.cutOff && (
              <span className="text-muted-foreground"> (cut off)</span>
            )}
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
