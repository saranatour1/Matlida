import * as React from 'react'
import {
  ArrowUpIcon,
  AudioLinesIcon,
  FileTextIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react'
import {
  ATTACHABLE,
  MAX_FILES,
  MAX_FILE_BYTES,
  attachable,
} from '../../convex/lib/attachments'
import type { Id } from '../../convex/_generated/dataModel'

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
import { Spinner } from '~/components/ui/spinner'
import { VoiceButton } from '~/components/voice-button'
import { useUpload } from '~/hooks/use-upload'

/** A file sent with a message, once it's uploaded. */
export type Attachment = {
  storageId: Id<'_storage'>
  filename: string
  mediaType: string
}

/** A file in the box: uploading until it has a `storageId`. */
type Attaching = {
  key: string
  filename: string
  mediaType: string
  /** A local preview of a picture. */
  preview?: string
  storageId?: Id<'_storage'>
}

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
  onSubmit: (prompt: string, files: Array<Attachment>) => void
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
  const picker = React.useRef<HTMLInputElement>(null)
  const upload = useUpload()
  const [files, setFiles] = React.useState<Array<Attaching>>([])
  const [error, setError] = React.useState<string>()
  const uploading = files.some((f) => !f.storageId)
  /** Starts uploading picked, pasted or dropped files, keeping to the limits. */
  const attach = (picked: Array<File>) => {
    setError(undefined)
    for (const [i, file] of picked.entries()) {
      if (files.length + i >= MAX_FILES) {
        setError(`Attach at most ${MAX_FILES} files.`)
        return
      }
      if (!attachable(file.type)) {
        setError('You can attach pictures and PDFs.')
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is over 10 MB.`)
        continue
      }
      const key = crypto.randomUUID()
      setFiles((all) => [
        ...all,
        {
          key,
          filename: file.name || 'pasted image',
          mediaType: file.type,
          preview: file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : undefined,
        },
      ])
      upload(file).then(
        (storageId) =>
          setFiles((all) =>
            all.map((f) => (f.key === key ? { ...f, storageId } : f)),
          ),
        (e: unknown) => {
          setFiles((all) => all.filter((f) => f.key !== key))
          setError(e instanceof Error ? e.message : 'The upload failed.')
        },
      )
    }
  }
  const remove = (key: string) =>
    setFiles((all) => {
      const gone = all.find((f) => f.key === key)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return all.filter((f) => f.key !== key)
    })
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
        const ready = files.flatMap((f) =>
          f.storageId
            ? [
                {
                  storageId: f.storageId,
                  filename: f.filename,
                  mediaType: f.mediaType,
                },
              ]
            : [],
        )
        const prompt = String(data.get('prompt')).trim()
        setValue('')
        for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview)
        setFiles([])
        onSubmit(prompt || 'Take a look at what I attached.', ready)
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return
        event.preventDefault()
        attach([...event.dataTransfer.files])
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
      {files.length > 0 && (
        <ul aria-label="Attachments" className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-1.5 text-xs"
            >
              {!f.storageId ? (
                <Spinner className="size-4" />
              ) : f.preview ? (
                <img
                  src={f.preview}
                  alt=""
                  className="size-5 rounded-full object-cover"
                />
              ) : (
                <FileTextIcon className="size-4 text-muted-foreground" />
              )}
              <span className="max-w-40 truncate">{f.filename}</span>
              <button
                type="button"
                aria-label={`Remove ${f.filename}`}
                onClick={() => remove(f.key)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <InputGroup className="rounded-3xl">
        <InputGroupTextarea
          ref={textarea}
          name="prompt"
          required={files.length === 0}
          maxLength={4000}
          placeholder={placeholder}
          className="px-4 pt-3.5 pb-2"
          onChange={(event) => {
            setValue(event.target.value)
            setActive(0)
          }}
          onPaste={(event) => {
            if (event.clipboardData.files.length === 0) return
            event.preventDefault()
            attach([...event.clipboardData.files])
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
              if (!isBusy && !uploading) {
                event.currentTarget.form?.requestSubmit()
              }
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
          <InputGroupButton
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Attach pictures or PDFs"
            title="Attach pictures or PDFs"
            onClick={() => picker.current?.click()}
          >
            <PaperclipIcon />
          </InputGroupButton>
          <input
            ref={picker}
            type="file"
            multiple
            accept={ATTACHABLE}
            hidden
            onChange={(event) => {
              attach([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <VoiceButton
            onError={setError}
            onText={(text) => {
              const el = textarea.current
              if (!el) return
              setError(undefined)
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
            disabled={isBusy || uploading}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </form>
  )
}
