import * as React from 'react'
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

type Session = {
  stream: MediaStream
  audio: AudioContext
  analyser: AnalyserNode
  recorder?: MediaRecorder
  playing?: AudioBufferSourceNode
  frame?: number
  ended: boolean
}

type Line = { who: 'you' | 'them'; text: string }

/**
 * A voice call with one assistant: listen until the user stops talking, send
 * the clip as one turn, play the spoken reply, then listen again. Start it
 * from a click, so the browser allows the microphone and audio playback.
 */
export function useVoiceCall({
  projectId,
  botId,
  threadId,
  onThread,
}: {
  projectId?: Id<'projects'>
  botId?: Id<'bots'>
  threadId?: string
  /** Called when the first turn starts a new chat, with its id. */
  onThread: (threadId: string) => void
}) {
  const [status, setStatus] = React.useState<Status>('idle')
  const [error, setError] = React.useState<string>()
  const [muted, setMuted] = React.useState(false)
  const [lines, setLines] = React.useState<Array<Line>>([])
  const session = React.useRef<Session | null>(null)
  const thread = React.useRef<string | undefined>(undefined)
  const uploadUrl = useMutation(api.api.chat.voiceUploadUrl)
  const turn = useAction(api.api.calls.turn)

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
    if (!projectId) return
    setStatus('thinking')
    try {
      const res = await fetch(await uploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': clip.type },
        body: clip,
      })
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
      const result = await turn({
        projectId,
        botId,
        threadId: thread.current,
        storageId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      // The user may have hung up while we waited.
      if (session.current !== s) return
      if (result.threadId && result.threadId !== thread.current) {
        thread.current = result.threadId
        onThread(result.threadId)
      }
      const said = result.transcript
      const reply = result.reply
      if (said) setLines((l) => [...l, { who: 'you', text: said }])
      if (reply) setLines((l) => [...l, { who: 'them', text: reply }])
      if (!result.audioUrl) {
        listen(s)
        return
      }
      const sound = await (await fetch(result.audioUrl)).arrayBuffer()
      const buffer = await s.audio.decodeAudioData(sound)
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
    } catch (e) {
      setError(errorMessage(e, "Couldn't reach the assistant. Try again."))
      listen(s)
    }
  }

  async function start() {
    if (session.current || !projectId) return
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
      const s: Session = { stream, audio, analyser, ended: false }
      session.current = s
      thread.current = threadId
      listen(s)
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

/** The full-screen call: the assistant's portrait, what's happening, and the last things said. */
export function VoiceCallScreen({
  call,
  name,
  portrait,
}: {
  call: ReturnType<typeof useVoiceCall>
  name: string
  portrait: Portrait
}) {
  const live = call.status === 'speaking' || call.status === 'hearing'
  return (
    <div
      role="dialog"
      aria-label={`Call with ${name}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center-safe gap-6 overflow-y-auto bg-background/95 px-6 py-6 backdrop-blur"
    >
      <div
        className={`rounded-[28%] p-1.5 transition-shadow ${
          live
            ? call.status === 'speaking'
              ? 'animate-pulse ring-4 ring-emerald-400/70'
              : 'ring-4 ring-sky-400/70'
            : 'ring-4 ring-transparent'
        }`}
      >
        <BotAvatar portrait={portrait} className="size-40" />
      </div>
      <div className="text-center">
        <p className="text-xl font-medium">{name}</p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {call.muted ? 'Muted' : STATUS_LABEL[call.status]}
        </p>
      </div>
      <div className="flex min-h-16 w-full max-w-md flex-col gap-1 text-center text-sm">
        {call.lines.slice(-2).map((line, i) => (
          <p
            key={i}
            className={
              line.who === 'you' ? 'text-muted-foreground' : 'text-foreground'
            }
          >
            {line.text}
          </p>
        ))}
        {call.error && <p className="text-destructive">{call.error}</p>}
      </div>
      <div className="flex gap-4">
        <Button
          variant="outline"
          className="size-14 rounded-full"
          aria-label={call.muted ? 'Unmute' : 'Mute'}
          disabled={call.status === 'idle' || call.status === 'starting'}
          aria-pressed={call.muted}
          onClick={call.toggleMute}
        >
          {call.muted ? <MicOffIcon /> : <MicIcon />}
        </Button>
        <Button
          variant="destructive"
          className="size-14 rounded-full"
          aria-label="Hang up"
          onClick={call.hangUp}
        >
          <PhoneOffIcon />
        </Button>
      </div>
    </div>
  )
}
