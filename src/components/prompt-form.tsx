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
  /** Commands the "+" menu offers: the built-ins, then the workspace's own. */
  commands?: Array<{ name: string; description: string; builtIn?: boolean }>
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
              {(['built-in', 'yours'] as const).map((group) => {
                const listed = commands.filter(
                  (c) => Boolean(c.builtIn) === (group === 'built-in'),
                )
                return listed.length === 0 ? null : (
                  <DropdownMenuGroup key={group}>
                    <DropdownMenuLabel>
                      {group === 'built-in' ? 'Commands' : 'Your commands'}
                    </DropdownMenuLabel>
                    {listed.map((c) => (
                      <DropdownMenuItem
                        key={c.name}
                        onClick={() => start(`/${c.name} `)}
                      >
                        <span className="font-mono text-xs">/{c.name}</span>
                        <span className="truncate text-muted-foreground">
                          {c.description}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                )
              })}
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
