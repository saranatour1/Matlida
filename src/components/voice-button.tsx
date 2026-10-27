import * as React from 'react'
import { useAction } from 'convex/react'
import { MicIcon, SquareIcon } from 'lucide-react'
import { api } from '~/lib/api'
import { InputGroupButton } from '~/components/ui/input-group'
import { Spinner } from '~/components/ui/spinner'
import { useUpload } from '~/hooks/use-upload'
import { errorMessage } from '~/lib/errors'

type Status = 'idle' | 'recording' | 'transcribing'

/**
 * Records from the microphone, transcribes on the server, and hands the text
 * to `onText`. Click once to start and again to stop.
 */
export function VoiceButton({
  onText,
  onError,
}: {
  onText: (text: string) => void
  onError: (message: string) => void
}) {
  const [status, setStatus] = React.useState<Status>('idle')
  const recorder = React.useRef<MediaRecorder | null>(null)
  const upload = useUpload()
  const transcribe = useAction(api.chat.transcribe)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Array<Blob> = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setStatus('transcribing')
        try {
          const audio = new Blob(chunks, { type: r.mimeType })
          const storageId = await upload(audio)
          const text = await transcribe({ storageId })
          if (text) onText(text)
        } catch (e) {
          onError(errorMessage(e, "Couldn't transcribe that. Try again."))
        }
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
      aria-label={status === 'recording' ? 'Stop recording' : 'Talk'}
      title={status === 'recording' ? 'Stop recording' : 'Talk'}
      disabled={status === 'transcribing'}
      onClick={() =>
        status === 'recording' ? recorder.current?.stop() : void start()
      }
    >
      {status === 'transcribing' ? (
        <Spinner />
      ) : status === 'recording' ? (
        <SquareIcon />
      ) : (
        <MicIcon />
      )}
    </InputGroupButton>
  )
}
