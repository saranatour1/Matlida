import * as React from 'react'
import { Extension } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useMutation, useQuery } from 'convex/react'
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  MessageSquarePlusIcon,
  MinusIcon,
  ScaleIcon,
  TextQuoteIcon,
} from 'lucide-react'
import type { Id } from '@convex/_generated/dataModel'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { api } from '~/lib/api'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'
import { RULES } from '~/lib/rules'
import { attempt } from '~/lib/attempt'

/** Where the notes on an editor's text live. */
type CommentTarget = {
  projectId: Id<'projects'>
  kind: 'project' | 'bot' | 'command'
  targetId: string
}

/** Highlights every passage a note quotes, as it stands in the text now. */
const CommentHighlights = Extension.create<{ quotes: Array<string> }>({
  name: 'commentHighlights',
  addOptions() {
    return { quotes: [] }
  },
  addProseMirrorPlugins() {
    const { quotes } = this.options
    return [
      new Plugin({
        key: new PluginKey('commentHighlights'),
        props: {
          decorations: (state) => highlight(state.doc, quotes),
        },
      }),
    ]
  },
})

function highlight(doc: ProseMirrorNode, quotes: Array<string>) {
  const decorations: Array<Decoration> = []
  if (quotes.length === 0) return DecorationSet.empty
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const quote of quotes) {
      let at = node.text.indexOf(quote)
      while (at >= 0) {
        decorations.push(
          Decoration.inline(pos + at, pos + at + quote.length, {
            class: 'comment-quote',
          }),
        )
        at = node.text.indexOf(quote, at + quote.length)
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * A markdown editor for instructions: formatting buttons, a Rules menu that
 * drops in ready-made rules, a raw markdown view, and notes on passages when
 * `comments` says where they live. The markdown is the only thing stored;
 * it's submitted with the form under `name`.
 */
export function MarkdownEditor({
  name,
  defaultValue = '',
  placeholder,
  comments,
}: {
  name: string
  defaultValue?: string
  placeholder?: string
  comments?: CommentTarget
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const [raw, setRaw] = React.useState(false)
  const notes = useQuery(api.comments.list, comments ?? 'skip')
  const quotes = (notes ?? []).filter((n) => !n.resolved).map((n) => n.quote)
  const quotesKey = quotes.join('\u0000')
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Markdown,
        CommentHighlights.configure({ quotes }),
      ],
      // After the first render the hidden input carries what the user typed.
      content: input.current?.value ?? defaultValue,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'typeset typeset-docs min-h-32 px-3 py-2 text-sm outline-none',
        },
      },
      onUpdate: ({ editor: current }) => {
        if (input.current) input.current.value = current.getMarkdown()
      },
    },
    [quotesKey],
  )

  // The editor doesn't re-render on every keystroke; pick what the buttons show.
  const view = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            active: TOOLS.map((tool) => tool.active?.(current) ?? false),
            selected: selectionText(current),
          }
        : null,
  })
  const markdown = () => input.current?.value ?? defaultValue
  const showRaw = () => {
    setRaw(true)
  }
  const showRich = () => {
    editor?.commands.setContent(markdown(), { contentType: 'markdown' })
    setRaw(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="hidden"
        name={name}
        ref={input}
        defaultValue={defaultValue}
      />
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
          {editor && view && !raw && (
            <Toolbar editor={editor} active={view.active} />
          )}
          {!raw && (
            <RulesMenu
              onPick={(text) =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent(text, { contentType: 'markdown' })
                  .run()
              }
            />
          )}
          {comments && view && !raw && (
            <NoteButton selected={view.selected} target={comments} />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={raw ? showRich : showRaw}
          >
            {raw ? 'Rich text' : 'Markdown'}
          </Button>
        </div>
        {raw ? (
          <Textarea
            defaultValue={markdown()}
            onChange={(event) => {
              if (input.current) input.current.value = event.target.value
            }}
            rows={12}
            className="rounded-t-none border-0 font-mono text-xs"
            placeholder={placeholder}
          />
        ) : editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="min-h-32 px-3 py-2 text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
      </div>
      {comments && notes && notes.length > 0 && <Notes notes={notes} />}
    </div>
  )
}

const TOOLS: ReadonlyArray<{
  label: string
  icon: React.ComponentType<{ className?: string }>
  run: (editor: Editor) => void
  active?: (editor: Editor) => boolean
}> = [
  {
    label: 'Heading 1',
    icon: Heading1Icon,
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    active: (e) => e.isActive('heading', { level: 1 }),
  },
  {
    label: 'Heading 2',
    icon: Heading2Icon,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    label: 'Heading 3',
    icon: Heading3Icon,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (e) => e.isActive('heading', { level: 3 }),
  },
  {
    label: 'Bold',
    icon: BoldIcon,
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    label: 'Italic',
    icon: ItalicIcon,
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    label: 'Code',
    icon: CodeIcon,
    run: (e) => e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive('code'),
  },
  {
    label: 'Bullet list',
    icon: ListIcon,
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
  {
    label: 'Numbered list',
    icon: ListOrderedIcon,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive('orderedList'),
  },
  {
    label: 'Quote',
    icon: TextQuoteIcon,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    label: 'Divider',
    icon: MinusIcon,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
]

/** The text the user selected, for a note. Empty when the cursor is collapsed. */
function selectionText(editor: Editor) {
  const { from, to } = editor.state.selection
  return from === to ? '' : editor.state.doc.textBetween(from, to, ' ')
}

function Toolbar({
  editor,
  active,
}: {
  editor: Editor
  active: Array<boolean>
}) {
  return (
    <>
      {TOOLS.map((tool, i) => (
        <Button
          key={tool.label}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={tool.label}
          title={tool.label}
          aria-pressed={active[i]}
          className="aria-pressed:bg-muted"
          onClick={() => tool.run(editor)}
        >
          <tool.icon className="size-4" />
        </Button>
      ))}
    </>
  )
}

/** Ready-made rules, inserted at the cursor as markdown. */
function RulesMenu({ onPick }: { onPick: (markdown: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
        aria-label="Add a rule"
        title="Add a rule"
      >
        <ScaleIcon className="size-4" />
        <span className="text-xs">Rules</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {RULES.map((rule) => (
          <DropdownMenuItem key={rule.id} onClick={() => onPick(rule.markdown)}>
            {rule.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Leaves a note on the selected passage. */
function NoteButton({
  selected,
  target,
}: {
  selected: string
  target: CommentTarget
}) {
  const add = useMutation(api.comments.add)
  const [quote, setQuote] = React.useState<string>()
  const [error, submit, isPending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      if (!quote) return undefined
      try {
        await add({ ...target, quote, text: String(data.get('text') ?? '') })
        setQuote(undefined)
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not save the note.')
      }
    },
    undefined,
  )
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Note on the selection"
        title={selected ? 'Note on the selection' : 'Select some text first'}
        onClick={() => selected && setQuote(selected.trim().slice(0, 500))}
      >
        <MessageSquarePlusIcon className="size-4" />
        <span className="text-xs">Note</span>
      </Button>
      {quote && (
        <form
          action={submit}
          className="flex w-full flex-col gap-2 border-t p-2 text-xs"
        >
          <p className="text-muted-foreground">
            On: <span className="comment-quote">{quote}</span>
          </p>
          <Textarea name="text" required rows={2} placeholder="Your note" />
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuote(undefined)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              Save note
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

type Note = {
  _id: Id<'comments'>
  quote: string
  text: string
  resolved: boolean
}

/** The notes on this text. Open ones are highlighted in the editor. */
function Notes({ notes }: { notes: Array<Note> }) {
  const setResolved = useMutation(api.comments.setResolved)
  const remove = useMutation(api.comments.remove)
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {notes.map((note) => (
        <li
          key={note._id}
          className={`flex items-start gap-2 rounded-lg border p-2 ${note.resolved ? 'text-muted-foreground' : ''}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <span className={note.resolved ? '' : 'comment-quote'}>
                {note.quote}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap">{note.text}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              void attempt(
                setResolved({ id: note._id, resolved: !note.resolved }),
              )
            }
          >
            {note.resolved ? 'Reopen' : 'Resolve'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Delete note"
            onClick={() => void attempt(remove({ id: note._id }))}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  )
}
