import * as React from 'react'
import { Link, useMatch, useNavigate } from '@tanstack/react-router'
import { useConvex, useMutation } from 'convex/react'
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  SettingsIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react'
import { api } from '@convex/_generated/api'
import { AUDIO_VOICES, audioVoiceName } from '@convex/lib/audio'
import { LANGUAGES, VOICES, VOICE_NAMES } from '@convex/lib/models'
import { localTimeZone } from '@convex/lib/time'
import type { Id } from '@convex/_generated/dataModel'
import type { Portrait } from '@convex/lib/portraits'
import type { Language } from '@convex/lib/models'
import { BotAvatar } from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { errorMessage } from '~/lib/errors'
import {
  MAX_VOLUME,
  SPEEDS,
  clampVolume,
  getCallAudioVoice,
  getCallLanguage,
  getCallSpeed,
  getCallVoice,
  getCallVolume,
  getFastVoice,
  saveCallAudioVoice,
  saveCallLanguage,
  saveCallSpeed,
  saveCallVoice,
  saveCallVolume,
  saveFastVoice,
  useCallAudioVoice,
  useCallLanguage,
  useCallSpeed,
  useCallVoice,
  useCallVolume,
  useFastVoice,
} from '~/hooks/use-call-settings'

import { useUpload } from '~/hooks/use-upload'
import { toWav } from '~/lib/wav'
import { hear, startListening } from '~/lib/turn-taking'

type CallVoice = (typeof VOICES)[number]
type AudioVoice = (typeof AUDIO_VOICES)[number]

/** A saved setting as the call takes it, or undefined for "their own" and "auto". The server checks the value. */
const pick = <T extends string>(saved: string) =>
  saved ? (saved as T) : undefined

type Status =
  'idle' | 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking'

/** Who the call is with. `threadId` fills in when the first turn starts a chat. */
type CallTarget = {
  projectId: Id<'projects'>
  botId?: Id<'bots'>
  threadId?: string
}

type Session = CallTarget & {
  stream: MediaStream
  audio: AudioContext
  /** Replies play through this, so the volume bar can turn them up or down. */
  gain: GainNode
  /** What the assistant is saying right now, for the speaking animation. */
  output: AnalyserNode
  analyser: AnalyserNode
  recorder?: MediaRecorder
  /** The assistant's reply while it arrives and plays. */
  reply?: Reply
  frame?: number
  /** The call's record in history, from its first turn or the answered ring. */
  callId?: Id<'calls'>
  ended: boolean
}

/** A spoken reply arriving a piece at a time, played in order as each piece arrives. */
type Reply = {
  /** Each piece's audio, by URL. An `<audio>` element plays it, so the speed setting keeps the pitch. */
  pieces: Array<string>
  /** The next piece to play. */
  next: number
  /** Every piece is in. */
  done: boolean
  playing?: { el: HTMLAudioElement }
  /** On hold while you talk over it: where it stopped in the current piece, in seconds. */
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
function useVoiceCall({
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
  const upload = useUpload()
  const startTurn = useMutation(api.api.calls.startTurn)
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
      // Fast voice's audio model takes WAV, not the browser's WebM.
      const fast = getFastVoice()
      const audio = fast ? await toWav(clip) : clip
      const storageId = await upload(audio)
      const liveKey = crypto.randomUUID()
      follow(s, liveKey)
      listen(s)
      // Starts the turn's workflow; the reply arrives through the live turn.
      const result = await startTurn({
        projectId: s.projectId,
        botId: s.botId,
        storageId,
        timeZone: localTimeZone(),
        callId: s.callId,
        interrupted: cutOff || undefined,
        liveKey,
        fast: fast || undefined,
        voice: fast ? undefined : pick<CallVoice>(getCallVoice()),
        audioVoice: fast ? pick<AudioVoice>(getCallAudioVoice()) : undefined,
        language: pick<Language>(getCallLanguage()),
      })
      // The user may have hung up while we waited.
      if (session.current !== s) return
      setError(undefined)
      s.callId = result.callId
      if (result.threadId !== s.threadId) {
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
        reply.pieces.push(piece.url)
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
      if (state.error) setError(state.error)
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
    play(s, reply, reply.pieces[index], 0)
  }

  /** Plays one piece from `offset` seconds in, through the call's volume, at the speed setting. */
  function play(s: Session, reply: Reply, url: string, offset: number) {
    const el = new Audio(url)
    el.crossOrigin = 'anonymous'
    el.playbackRate = getCallSpeed()
    el.currentTime = offset
    s.audio.createMediaElementSource(el).connect(s.gain)
    const next = () => {
      // Not when paused or hung up: those clear `playing` first.
      if (reply.playing?.el !== el) return
      reply.playing = undefined
      reply.next++
      playNext(s)
    }
    el.onended = next
    // A piece that won't play is skipped, so the reply carries on.
    el.onerror = next
    reply.playing = { el }
    setStatus('speaking')
    void el.play().catch(next)
  }

  function pause(s: Session) {
    const reply = s.reply
    if (!reply) return
    const playing = reply.playing
    reply.paused = { offset: playing?.el.currentTime ?? 0 }
    reply.playing = undefined
    playing?.el.pause()
  }

  /** Carries on with the paused reply from where it stopped. */
  function resume(s: Session) {
    const reply = s.reply
    if (!reply?.paused) return
    const { offset } = reply.paused
    reply.paused = undefined
    setStatus('thinking')
    if (!offset || reply.next >= reply.pieces.length) return playNext(s)
    play(s, reply, reply.pieces[reply.next], offset)
  }

  /** Stops the reply and stops waiting for the rest of it. */
  function drop(s: Session) {
    const reply = s.reply
    if (!reply) return
    s.reply = undefined
    reply.stopWatching()
    const playing = reply.playing
    reply.playing = undefined
    playing?.el.pause()
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
      const gain = audio.createGain()
      gain.gain.value = getCallVolume()
      gain.connect(audio.destination)
      const output = audio.createAnalyser()
      output.fftSize = 1024
      gain.connect(output)
      const s: Session = {
        ...target,
        stream,
        audio,
        gain,
        output,
        analyser,
        ended: false,
      }
      session.current = s
      const first = await opening?.catch(() => null)
      if (session.current !== s) return
      if (first) setLines([{ who: 'them', text: first.text }])
      s.callId = first?.callId
      if (first?.audioUrl) {
        s.reply = {
          pieces: [first.audioUrl],
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

  const volume = useCallVolume()
  /** Saved for next time, and applied to what's playing now, smoothed so it doesn't click. */
  function setVolume(next: number) {
    saveCallVolume(next)
    const s = session.current
    s?.gain.gain.setTargetAtTime(clampVolume(next), s.audio.currentTime, 0.03)
  }

  /** Saved for next time, and applied to the piece playing now. */
  function setSpeed(next: number) {
    saveCallSpeed(next)
    const playing = session.current?.reply?.playing
    if (playing) playing.el.playbackRate = next
  }

  /** How loud you and the assistant are right now, 0 to 1, read each animation frame. */
  const levels = {
    you: () => levelOf(session.current?.analyser),
    them: () => levelOf(session.current?.output),
  }

  return {
    status,
    error,
    muted,
    lines,
    levels,
    volume,
    start,
    hangUp,
    toggleMute,
    setVolume,
    setSpeed,
  }
}

/** The loudness of what `analyser` hears, scaled so speech reaches about 1. */
function levelOf(analyser: AnalyserNode | undefined) {
  if (!analyser) return 0
  const samples = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(samples)
  let sum = 0
  for (const x of samples) sum += x * x
  return Math.min(1, Math.sqrt(sum / samples.length) * 8)
}

type Caller = {
  name: string
  portrait: Portrait
}

const CallContext = React.createContext<{
  call: ReturnType<typeof useVoiceCall>
  /** Who the call is with, kept from the start, since the page can change during the call. */
  caller?: Caller & { target: CallTarget }
  /** Starts a call unless one is on. Call it from a click. */
  startCall: (target: CallTarget, caller: Caller, opening?: Opening) => void
} | null>(null)

/** The app's one call, so a ring can't start a second call over the first. Its chat's `VoiceBar` shows it, and `CallPill` everywhere else. */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [caller, setCaller] = React.useState<Caller & { target: CallTarget }>()
  const call = useVoiceCall({
    onThread: ({ projectId, botId }) =>
      void navigate({
        to: '/p/$projectId',
        params: { projectId },
        search: (prev) => ({ ...prev, bot: botId }),
      }),
  })
  function startCall(target: CallTarget, who: Caller, opening?: Opening) {
    if (call.status !== 'idle') return
    setCaller({ ...who, target })
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

/** The call, on any page but its chat: who it's with, a way back, and hang up. */
export function CallPill() {
  const { call, caller } = useCall()
  const chat = useMatch({ from: '/_app/p/$projectId/', shouldThrow: false })
  if (!caller || (call.status === 'idle' && !call.error)) return null
  const { projectId, botId } = caller.target
  if (chat?.params.projectId === projectId && chat.search.bot === botId) {
    return null
  }
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border bg-popover p-1.5 pl-2 text-popover-foreground shadow-lg"
    >
      <BotAvatar portrait={caller.portrait} className="size-8" />
      <Link
        to="/p/$projectId"
        params={{ projectId }}
        search={{ bot: botId }}
        className="pr-1 text-sm font-medium hover:underline"
      >
        On a call with {caller.name}
      </Link>
      <Button
        variant="destructive"
        size="icon-sm"
        className="rounded-full"
        aria-label="Hang up"
        onClick={call.hangUp}
      >
        <PhoneOffIcon />
      </Button>
    </div>
  )
}

/**
 * The call's voice, speed and language, kept on this browser. The voice list
 * follows Fast voice, which has voices of its own. Changes apply from the
 * next thing the assistant says; the speed applies to what's playing too.
 */
function CallSettings({ onSpeed }: { onSpeed: (speed: number) => void }) {
  const fast = useFastVoice()
  const voice = useCallVoice()
  const audioVoice = useCallAudioVoice()
  const speed = useCallSpeed()
  const language = useCallLanguage()
  return (
    <dl className="flex flex-col divide-y border-b text-sm">
      <SettingRow label="Voice">
        {fast ? (
          <select
            aria-label="Voice"
            value={audioVoice}
            onChange={(e) => saveCallAudioVoice(e.target.value)}
            className={SELECT}
          >
            <option value="">Their own</option>
            {AUDIO_VOICES.map((v) => (
              <option key={v} value={v}>
                {audioVoiceName(v)}
              </option>
            ))}
          </select>
        ) : (
          <select
            aria-label="Voice"
            value={voice}
            onChange={(e) => saveCallVoice(e.target.value)}
            className={SELECT}
          >
            <option value="">Their own</option>
            {VOICES.map((v) => (
              <option key={v} value={v}>
                {VOICE_NAMES[v]}
              </option>
            ))}
          </select>
        )}
      </SettingRow>
      <SettingRow label="Speed">
        <select
          aria-label="Speed"
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          className={SELECT}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Language">
        <select
          aria-label="Language"
          value={language}
          onChange={(e) => saveCallLanguage(e.target.value)}
          className={SELECT}
        >
          <option value="">Auto-detect</option>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </SettingRow>
    </dl>
  )
}

const SELECT =
  'rounded-md border bg-background px-2 py-1 text-sm text-foreground'

function SettingRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** The Fast voice switch: quicker spoken answers from an audio chat model, without tools. */
function FastVoice() {
  const fast = useFastVoice()
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        role="switch"
        checked={fast}
        onChange={(e) => saveFastVoice(e.target.checked)}
        className="mt-1 accent-primary"
      />
      <span>
        Fast voice
        <span className="block text-xs text-muted-foreground">
          Answers sooner, but can’t set reminders, search or use other tools on
          the call.
        </span>
      </span>
    </label>
  )
}

/**
 * How loud the assistant's replies are: a speaker button that mutes them and
 * brings them back to where they were, a slider, and the level.
 */
function VolumeBar({
  volume,
  onChange,
}: {
  volume: number
  onChange: (volume: number) => void
}) {
  const audible = React.useRef(volume || 1)
  const percent = `${Math.round(volume * 100)}%`
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Volume">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={volume > 0 ? 'Mute the assistant' : 'Unmute the assistant'}
        title={volume > 0 ? 'Mute the assistant' : 'Unmute the assistant'}
        aria-pressed={volume === 0}
        onClick={() => {
          if (volume === 0) return onChange(audible.current)
          audible.current = volume
          onChange(0)
        }}
      >
        {volume === 0 ? (
          <VolumeXIcon />
        ) : volume < 0.5 ? (
          <Volume1Icon />
        ) : (
          <Volume2Icon />
        )}
      </Button>
      <input
        type="range"
        min={0}
        max={MAX_VOLUME}
        step={0.05}
        value={volume}
        aria-label="Call volume"
        aria-valuetext={percent}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
      />
      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
        {percent}
      </span>
    </div>
  )
}

/**
 * Talking hands-free in the chat, in place of the message box: you and the
 * assistant side by side, each swelling with your voice as you talk, and a
 * wave between you in the colour of whoever is speaking. What's said lands in
 * the chat as messages. It keeps listening until you end it.
 */
export function VoiceBar() {
  const { call, caller } = useCall()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  if (!caller) return null
  const you = call.status === 'hearing'
  const them = call.status === 'speaking'
  const label = call.muted
    ? 'Your mic is muted'
    : {
        idle: '',
        starting: 'Connecting…',
        listening: 'Listening…',
        hearing: 'You’re talking…',
        thinking: `${caller.name} is thinking…`,
        speaking: `${caller.name} is talking…`,
      }[call.status]
  return (
    <section
      aria-label={`Talking with ${caller.name}`}
      className="flex flex-col gap-3 rounded-3xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <Speaker level={call.levels.you} active={you} tone="you">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
            You
          </span>
        </Speaker>
        <Wave
          level={them ? call.levels.them : call.levels.you}
          active={you || them}
          tone={them ? 'them' : 'you'}
        />
        <Speaker level={call.levels.them} active={them} tone="them">
          <BotAvatar portrait={caller.portrait} className="size-12" />
        </Speaker>
      </div>
      <p
        aria-live="polite"
        className="text-center text-sm text-muted-foreground"
      >
        {label}
      </p>
      {call.error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {call.error}
        </p>
      )}
      <VolumeBar volume={call.volume} onChange={call.setVolume} />
      {settingsOpen && (
        <div className="flex flex-col gap-3 overflow-hidden rounded-xl border">
          <CallSettings onSpeed={call.setSpeed} />
          <div className="px-4 pb-3">
            <FastVoice />
          </div>
        </div>
      )}
      <div className="flex justify-center gap-3">
        <Button
          variant={settingsOpen ? 'secondary' : 'outline'}
          className="size-11 rounded-full"
          aria-label="Voice settings"
          aria-pressed={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <SettingsIcon />
        </Button>
        <Button
          variant="outline"
          className="size-11 rounded-full"
          aria-label={call.muted ? 'Unmute your mic' : 'Mute your mic'}
          aria-pressed={call.muted}
          disabled={call.status === 'idle' || call.status === 'starting'}
          onClick={call.toggleMute}
        >
          {call.muted ? <MicOffIcon /> : <MicIcon />}
        </Button>
        <Button
          variant="destructive"
          className="size-11 rounded-full"
          aria-label="Stop talking"
          onClick={call.hangUp}
        >
          <PhoneOffIcon />
        </Button>
      </div>
    </section>
  )
}

const TONE = {
  you: { ring: 'bg-sky-400/40', bar: 'bg-sky-400' },
  them: { ring: 'bg-emerald-400/40', bar: 'bg-emerald-400' },
}

/** Runs `paint` every frame while the element is on screen, without re-rendering; nothing moves for reduced motion. */
function animate<TElement extends HTMLElement>(
  paint: (el: TElement, now: number) => void,
) {
  return (el: TElement | null) => {
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = requestAnimationFrame(function tick(now) {
      paint(el, now)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }
}

/** A face with a halo that swells with their voice while it's their turn. */
function Speaker({
  level,
  active,
  tone,
  children,
}: {
  level: () => number
  active: boolean
  tone: keyof typeof TONE
  children: React.ReactNode
}) {
  return (
    <span className="relative flex size-16 items-center justify-center">
      <span
        aria-hidden
        className={`absolute inset-1 rounded-full transition-opacity ${TONE[tone].ring} ${active ? 'opacity-100' : 'opacity-0'}`}
        ref={animate<HTMLSpanElement>((el) => {
          el.style.transform = `scale(${1 + (active ? level() : 0) * 0.45})`
        })}
      />
      <span className="relative">{children}</span>
    </span>
  )
}

const BARS = [0.5, 0.8, 1, 0.7, 0.9, 0.6, 0.75]

/** Bars between the two faces, moving with whoever is talking, resting low otherwise. */
function Wave({
  level,
  active,
  tone,
}: {
  level: () => number
  active: boolean
  tone: keyof typeof TONE
}) {
  return (
    <span
      aria-hidden
      className="flex h-10 items-center gap-1"
      ref={animate<HTMLSpanElement>((el, now) => {
        const loud = active ? level() : 0
        Array.from(el.children).forEach((bar, i) => {
          const wobble = 0.6 + 0.4 * Math.sin(now / 140 + i * 1.3)
          const height = 0.15 + loud * BARS[i] * wobble
          ;(bar as HTMLElement).style.height = `${Math.min(1, height) * 100}%`
        })
      })}
    >
      {BARS.map((_, i) => (
        <span
          key={i}
          className={`h-[15%] w-1.5 rounded-full transition-colors ${active ? TONE[tone].bar : 'bg-muted-foreground/30'}`}
        />
      ))}
    </span>
  )
}
