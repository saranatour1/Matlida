import * as React from 'react'
import { ArrowUpIcon } from 'lucide-react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '~/components/ui/input-group'
import { VoiceButton } from '~/components/voice-button'

export function PromptForm({
  placeholder,
  isBusy,
  onSubmit,
}: {
  placeholder: string
  isBusy: boolean
  onSubmit: (prompt: string) => void
}) {
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const [voiceError, setVoiceError] = React.useState<string>()
  return (
    <form action={(data) => onSubmit(String(data.get('prompt')))}>
      <InputGroup>
        <InputGroupTextarea
          ref={textarea}
          name="prompt"
          required
          maxLength={4000}
          placeholder={placeholder}
          className="p-3.5"
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              if (!isBusy) event.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <VoiceButton
            onError={setVoiceError}
            onText={(text) => {
              const el = textarea.current
              if (!el) return
              setVoiceError(undefined)
              el.value = el.value ? `${el.value} ${text}` : text
              el.focus()
            }}
          />
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            aria-label="Send message"
            className="ml-auto"
            disabled={isBusy}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {voiceError && (
        <p className="mt-1 text-xs text-destructive">{voiceError}</p>
      )}
    </form>
  )
}
