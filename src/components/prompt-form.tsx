import * as React from 'react'
import { ArrowUpIcon, PlusIcon, SparklesIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '~/components/ui/input-group'
import { VoiceButton } from '~/components/voice-button'

/** Ways to start a message, in the "+" menu. Each fills the box for you to finish. */
const STARTERS = [
  { label: 'Write a plan', text: 'Make a plan for ' },
  { label: 'Run a plan', text: 'Make a plan and run it step by step: ' },
  {
    label: 'Draft posts',
    text: 'Draft posts for X, Reddit and Discord about ',
  },
  { label: 'Draft an email', text: 'Draft an email to ' },
  { label: 'Draft a doc', text: 'Draft a doc about ' },
  { label: 'Research', text: 'Research ' },
]

export function PromptForm({
  placeholder,
  isBusy,
  onSubmit,
  commands = [],
  onCreateCommand,
  tools,
}: {
  placeholder: string
  isBusy: boolean
  onSubmit: (prompt: string) => void
  /** `/name` commands the "+" menu can run. */
  commands?: Array<{ name: string; description: string }>
  /** Opens the dialog that writes a new command with AI. */
  onCreateCommand?: () => void
  /** Shown next to the send button, like the model menu. */
  tools?: React.ReactNode
}) {
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const [voiceError, setVoiceError] = React.useState<string>()
  /** Puts `text` in the box, ready to finish. The menu closes first, so focus waits a tick. */
  const start = (text: string) => {
    const el = textarea.current
    if (!el) return
    el.value = text
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<InputGroupButton size="icon-sm" variant="ghost" />}
              aria-label="Start something"
              title="Start something"
            >
              <PlusIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Start with</DropdownMenuLabel>
                {STARTERS.map((s) => (
                  <DropdownMenuItem key={s.label} onClick={() => start(s.text)}>
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {commands.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Your commands</DropdownMenuLabel>
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
                </>
              )}
              {onCreateCommand && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onCreateCommand}>
                    <SparklesIcon />
                    Create a command with AI…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
          <div className="ml-auto" />
          {tools}
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            aria-label="Send message"
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
