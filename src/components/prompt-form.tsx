import * as React from 'react'
import { ArrowUpIcon, PlusIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
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
  commands = [],
}: {
  placeholder: string
  isBusy: boolean
  onSubmit: (prompt: string) => void
  /** `/name` commands the "+" menu can run. */
  commands?: Array<{ name: string; description: string }>
}) {
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const [voiceError, setVoiceError] = React.useState<string>()
  return (
    <form action={(data) => onSubmit(String(data.get('prompt')))}>
      <InputGroup className="rounded-3xl">
        <InputGroupTextarea
          ref={textarea}
          name="prompt"
          required
          maxLength={4000}
          placeholder={placeholder}
          className="px-4 pt-3.5 pb-2"
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
          {commands.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<InputGroupButton size="icon-sm" variant="ghost" />}
                aria-label="Commands"
                title="Commands"
              >
                <PlusIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Commands</DropdownMenuLabel>
                  {commands.map((c) => (
                    <DropdownMenuItem
                      key={c.name}
                      onClick={() => !isBusy && onSubmit(`/${c.name}`)}
                    >
                      <span className="font-mono text-xs">/{c.name}</span>
                      <span className="truncate text-muted-foreground">
                        {c.description}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
