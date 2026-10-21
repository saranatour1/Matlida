import * as React from 'react'
import { useAction, useMutation } from 'convex/react'
import { AudioLinesIcon, MicIcon, SquareIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { InputGroupButton } from '~/components/ui/input-group'
import { Spinner } from '~/components/ui/spinner'
import { errorMessage } from '~/lib/errors'

type Status = 'idle' | 'recording' | 'working'

/**
 * Records from the microphone and hands the recording to `onRecorded`. Click
 * once to start and again to stop.
 */
function RecordButton({
  label,
  icon,
  onRecorded,
  onError,
}: {
  label: string
  icon: React.ReactNode
  onRecorded: (audio: Blob) => Promise<void>
  onError: (message: string) => void
}) {
  const [status, setStatus] = React.useState<Status>('idle')
  const recorder = React.useRef<MediaRecorder | null>(null)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Array<Blob> = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setStatus('working')
        await onRecorded(new Blob(chunks, { type: r.mimeType }))
        setStatus('idle')
      }
      recorder.current = r
      r.start()
      setStatus('recording')
    } catch {
      onError('Allow microphone access to talk to your assistants.')
    }
  }

  return (
    <InputGroupButton
      type="button"
      size="icon-sm"
      variant={status === 'recording' ? 'destructive' : 'ghost'}
      aria-label={status === 'recording' ? 'Stop recording' : label}
      title={status === 'recording' ? 'Stop recording' : label}
      disabled={status === 'working'}
      onClick={() =>
        status === 'recording' ? recorder.current?.stop() : void start()
      }
    >
      {status === 'working' ? (
        <Spinner />
      ) : status === 'recording' ? (
        <SquareIcon />
      ) : (
        icon
      )}
    </InputGroupButton>
  )
}

/** Dictation: transcribes on the server and hands the text to `onText`. */
export function VoiceButton({
  onText,
  onError,
}: {
  onText: (text: string) => void
  onError: (message: string) => void
}) {
  const uploadUrl = useMutation(api.api.chat.voiceUploadUrl)
  const transcribe = useAction(api.api.chat.transcribe)
  return (
    <RecordButton
      label="Talk"
      icon={<MicIcon />}
      onError={onError}
      onRecorded={async (audio) => {
        try {
          const res = await fetch(await uploadUrl(), {
            method: 'POST',
            headers: { 'Content-Type': audio.type },
            body: audio,
          })
          const { storageId } = (await res.json()) as { storageId: string }
          const text = await transcribe({
            storageId: storageId as Id<'_storage'>,
          })
          if (text) onText(text)
        } catch (e) {
          onError(errorMessage(e, "Couldn't transcribe that. Try again."))
        }
      }}
    />
  )
}

/** A voice note: the assistant hears it and answers in voice. */
export function VoiceNoteButton({
  onRecorded,
  onError,
}: {
  onRecorded: (audio: Blob) => Promise<void>
  onError: (message: string) => void
}) {
  return (
    <RecordButton
      label="Send a voice note"
      icon={<AudioLinesIcon />}
      onError={onError}
      onRecorded={onRecorded}
    />
  )
}
