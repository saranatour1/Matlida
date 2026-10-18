import { ArrowUpIcon } from 'lucide-react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '~/components/ui/input-group'

export function PromptForm({
  placeholder,
  isBusy,
  onSubmit,
}: {
  placeholder: string
  isBusy: boolean
  onSubmit: (prompt: string) => void
}) {
  return (
    <form action={(data) => onSubmit(String(data.get('prompt')))}>
      <InputGroup>
        <InputGroupTextarea
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
    </form>
  )
}
