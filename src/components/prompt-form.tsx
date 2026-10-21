import * as React from 'react'
import {
  ArrowUpIcon,
  AudioLinesIcon,
  PlusIcon,
  SparklesIcon,
} from 'lucide-react'

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
  onTalk,
  tools,
}: {
  placeholder: string
  isBusy: boolean
  onSubmit: (prompt: string) => void
  /** Commands the "+" menu offers: the built-ins, then the workspace's own. */
  commands?: Array<{ name: string; description: string; builtIn?: boolean }>
  /** Opens the dialog that writes a new command with AI. */
  onCreateCommand?: () => void
  /** Starts talking hands-free with the assistant, in place of the box. */
  onTalk?: () => void
  /** Shown next to the send button, like the model menu. */
  tools?: React.ReactNode
}) {
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const [voiceError, setVoiceError] = React.useState<string>()
  // The box stays uncontrolled; this mirrors it so `/` can open the command list.
  const [value, setValue] = React.useState('')
  const [active, setActive] = React.useState(0)
  /** The text Esc closed the list at; typing on opens it again. */
  const [closedAt, setClosedAt] = React.useState<string>()
  /** While the box holds `/` and part of a name, the commands it could be, like Discord. */
  const typing = /^\/([a-z0-9-]*)$/i.exec(value)?.[1]?.toLowerCase()
  const matches =
    typing === undefined || closedAt === value
      ? []
      : commands.filter((c) => c.name.startsWith(typing)).slice(0, 8)
  /** Once a name and a space are typed, the command the message runs. */
  const typed = /^\/([a-z0-9-]+)\s/i.exec(value)?.[1]?.toLowerCase()
  const running = typed ? commands.find((c) => c.name === typed) : undefined
  /** Puts `text` in the box, ready to finish. A menu closes first, so focus waits a tick. */
  const start = (text: string) => {
    const el = textarea.current
    if (!el) return
    el.value = text
    setValue(text)
    setActive(0)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }
  return (
    <form
      action={(data) => {
        setValue('')
        onSubmit(String(data.get('prompt')))
      }}
      className="relative"
    >
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Commands"
          className="absolute inset-x-0 bottom-full z-10 mb-2 flex flex-col gap-0.5 rounded-2xl border bg-popover p-1.5 text-sm shadow-md"
        >
          {matches.map((c, i) => (
            <li
              key={c.name}
              role="option"
              aria-selected={i === active}
              // Keep the box focused while clicking.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => start(`/${c.name} `)}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 aria-selected:bg-accent"
            >
              <span className="font-mono text-xs">/{c.name}</span>
              <span className="truncate text-muted-foreground">
                {c.description}
              </span>
            </li>
          ))}
        </ul>
      )}
      {typed && (
        <p
          className={`mb-1.5 px-3 text-xs ${running ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {running ? (
            <>
              <span className="font-mono">/{running.name}</span> ·{' '}
              {running.description}
            </>
          ) : (
            `There's no /${typed} command.`
          )}
        </p>
      )}
      <InputGroup className="rounded-3xl">
        <InputGroupTextarea
          ref={textarea}
          name="prompt"
          required
          maxLength={4000}
          placeholder={placeholder}
          className="px-4 pt-3.5 pb-2"
          onChange={(event) => {
            setValue(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (matches.length > 0) {
              const move = { ArrowDown: 1, ArrowUp: -1 }[event.key]
              if (move) {
                event.preventDefault()
                setActive((active + move + matches.length) % matches.length)
                return
              }
              if (event.key === 'Tab' || event.key === 'Enter') {
                event.preventDefault()
                start(`/${matches[active].name} `)
                return
              }
              if (event.key === 'Escape') {
                setClosedAt(value)
                return
              }
            }
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
          {onTalk && (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Talk hands-free"
              title="Talk hands-free"
              onClick={onTalk}
            >
              <AudioLinesIcon />
            </InputGroupButton>
          )}
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
