import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'
import { MarkdownEditor } from '~/components/markdown-editor'
import { StudyDeck } from '~/components/study-part'
import { Button } from '~/components/ui/button'
import { reminderWhen } from '~/lib/reminders'
import { Input } from '~/components/ui/input'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'
import { attempt } from '~/lib/attempt'

export const Route = createFileRoute('/_app/p/$projectId/library')({
  component: Library,
})

type Editing = Doc<'commands'> & { markdown: string }

/** What the assistants made and use: reminders, plans and commands. */
function Library() {
  const project = useProject()
  const commands = useQuery(
    api.commands.list,
    project ? { projectId: project._id } : 'skip',
  )
  const remove = useMutation(api.commands.remove)
  const convex = useConvex()
  // The markdown lives in Convex storage, so Edit fetches it before the form opens.
  const [editing, edit, isLoading] = React.useActionState(
    async (_previous: Editing | undefined, command: Doc<'commands'> | null) => {
      if (!command) return undefined
      const found = await convex.query(api.commands.get, {
        id: command._id,
      })
      const markdown = found?.url ? await (await fetch(found.url)).text() : ''
      return { ...command, markdown }
    },
    undefined,
  )
  const stopEditing = () => React.startTransition(() => edit(null))

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Library</h1>
          <Pages projectId={project._id} />
          <Reminders projectId={project._id} />
          <Study projectId={project._id} />
          <Plans projectId={project._id} />
          <h2 className="mt-6 font-medium">Commands</h2>
          <p className="text-sm text-muted-foreground">
            Type <code>/name</code> in a chat to have {project.name} follow a
            command. Each one is a markdown file in Convex storage.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {commands?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No commands yet. Create one below.
            </li>
          )}
          {commands?.map((c) => (
            <li
              key={c._id}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">/{c.name}</p>
                <p className="mt-1 text-muted-foreground">{c.description}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={() => React.startTransition(() => edit(c))}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove /${c.name}`}
                onClick={() => {
                  if (editing?._id === c._id) stopEditing()
                  void attempt(remove({ id: c._id }))
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>

        <CommandForm
          key={editing?._id ?? 'new'}
          projectId={project._id}
          command={editing}
          onDone={stopEditing}
        />
      </div>
    </div>
  )
}

type Values = Pick<Editing, 'name' | 'description' | 'markdown'>
type FormState = { error?: string; values?: Values }

function CommandForm({
  projectId,
  command,
  onDone,
}: {
  projectId: Id<'projects'>
  command?: Editing
  onDone: () => void
}) {
  const save = useAction(api.commands.save)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        description: String(data.get('description')),
        markdown: String(data.get('markdown')),
      }
      try {
        await save({ projectId, id: command?._id, ...values })
        onDone()
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? command

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {command ? `Edit /${command.name}` : 'Create a command'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={32}
          placeholder="standup"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Description
        <Input
          name="description"
          defaultValue={values?.description}
          required
          maxLength={200}
          placeholder="Run a quick standup with every bot."
        />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        What to do
        <MarkdownEditor
          name="markdown"
          defaultValue={values?.markdown}
          placeholder="Ask each bot for its top priority this week, then summarize."
          comments={
            command
              ? { projectId, kind: 'command', targetId: command._id }
              : undefined
          }
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {command && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {command ? 'Save changes' : 'Create command'}
        </Button>
      </div>
    </form>
  )
}

/** Plans assistants saved with `save_plan`. Tick steps off as you go. */
function Plans({ projectId }: { projectId: Id<'projects'> }) {
  const plans = useQuery(api.plans.list, { projectId })
  const toggle = useMutation(api.plans.toggleStep)
  const remove = useMutation(api.plans.remove)
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-medium">Plans</h2>
      {plans?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No plans yet. Ask an assistant to make one.
        </p>
      )}
      {plans?.map((plan) => (
        <div key={plan._id} className="rounded-xl border p-3 text-sm">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-medium">{plan.title}</p>
            <span className="text-xs text-muted-foreground">
              {plan.steps.filter((s) => s.done).length}/{plan.steps.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void attempt(remove({ id: plan._id }))}
            >
              Delete
            </Button>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.steps.map((step, index) => (
              <li key={index}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={() =>
                      void attempt(toggle({ id: plan._id, index }))
                    }
                    className="mt-1"
                  />
                  <span
                    className={
                      step.done ? 'text-muted-foreground line-through' : ''
                    }
                  >
                    {step.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** Reports, memos and dashboards, newest first. */
function Pages({ projectId }: { projectId: Id<'projects'> }) {
  const pages = useQuery(api.pages.list, { projectId })
  if (!pages?.length) return null
  return (
    <section className="mt-4 flex flex-col gap-2" aria-labelledby="pages">
      <h2 id="pages" className="font-medium">
        Pages
      </h2>
      <ul className="flex flex-col gap-1">
        {pages.map((page) => (
          <li key={page._id} className="flex items-center gap-2 text-sm">
            <Link
              to="/p/$projectId/pages/$pageId"
              params={{ projectId, pageId: page._id }}
              className="flex-1 truncate underline-offset-4 hover:underline"
            >
              {page.title}
            </Link>
            <span className="text-xs text-muted-foreground capitalize">
              {page.kind}
              {page.refresh && ` · every ${page.refresh.every}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Reminders waiting to go out. Recurring ones can be paused and resumed. */
function Reminders({ projectId }: { projectId: Id<'projects'> }) {
  const reminders = useQuery(api.reminders.list, { projectId })
  const cancel = useMutation(api.reminders.cancel)
  const pause = useMutation(api.reminders.pause)
  const resume = useMutation(api.reminders.resume)
  if (!reminders?.length) return null
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-medium">Reminders</h2>
      <ul className="flex flex-col gap-2">
        {reminders.map((r) => (
          <li
            key={r._id}
            className="flex items-center gap-3 rounded-xl border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{r.message}</p>
              <p className="text-xs text-muted-foreground">
                {r.status === 'paused' && 'Paused · '}
                {reminderWhen(r.dueAt, r.repeat?.every)} · {r.via} · from{' '}
                {r.from}
              </p>
            </div>
            {r.repeat && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void attempt(
                    (r.status === 'paused' ? resume : pause)({ id: r._id }),
                  )
                }
              >
                {r.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void attempt(cancel({ id: r._id }))}
            >
              {r.repeat ? 'Stop' : 'Cancel'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Your flash cards and quizzes: open one to study it, delete it, or make a new one. */
function Study({ projectId }: { projectId: Id<'projects'> }) {
  const decks = useQuery(api.study.list, { projectId })
  const make = useAction(api.study.make)
  const remove = useMutation(api.study.remove)
  const [open, setOpen] = React.useState<string>()
  const [error, submit, isPending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      try {
        const { deckId } = await make({
          projectId,
          topic: String(data.get('topic')),
          format: data.get('format') === 'quiz' ? 'quiz' : 'cards',
          count: Number(data.get('count')),
          level: String(data.get('level')) as
            'beginner' | 'intermediate' | 'advanced',
        })
        setOpen(deckId)
        return undefined
      } catch (e) {
        return errorMessage(e, 'Couldn’t make the deck. Try again.')
      }
    },
    undefined,
  )
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-medium">Study</h2>
      <form
        action={submit}
        className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
      >
        <Input
          name="topic"
          required
          minLength={2}
          maxLength={500}
          placeholder="What to study, like Spanish greetings"
          className="min-w-48 flex-1"
        />
        <select name="format" aria-label="Format" className={SELECT}>
          <option value="cards">Flash cards</option>
          <option value="quiz">Quiz</option>
        </select>
        <Input
          name="count"
          type="number"
          aria-label="How many"
          min={3}
          max={30}
          defaultValue={10}
          className="w-20"
        />
        <select name="level" aria-label="Level" className={SELECT}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Making…' : 'Make'}
        </Button>
        {error && <p className="w-full text-destructive">{error}</p>}
      </form>
      <ul className="flex flex-col gap-2">
        {decks?.map(({ deck, due }) => (
          <li key={deck._id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-expanded={open === deck._id}
                onClick={() =>
                  setOpen(open === deck._id ? undefined : deck._id)
                }
              >
                <p className="truncate">{deck.title}</p>
                <p className="text-xs text-muted-foreground">
                  {deck.format === 'quiz' ? 'Quiz' : 'Flash cards'} ·{' '}
                  {due ? `${due} due` : 'nothing due'}
                </p>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void attempt(remove({ id: deck._id }))}
              >
                Delete
              </Button>
            </div>
            {open === deck._id && <StudyDeck deckId={deck._id} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

const SELECT = 'h-9 rounded-md border bg-background px-2 text-sm'
