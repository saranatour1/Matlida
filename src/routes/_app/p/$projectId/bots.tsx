import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { PlusIcon } from 'lucide-react'
import { z } from 'zod'
import { api } from '../../../../../convex/_generated/api'
import type { Avatar } from '../../../../../convex/lib/avatars'
import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { AvatarPicker, defaultAvatar } from '~/components/orb'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { useProject } from '~/hooks/use-project'
import { BOT_TEMPLATES } from '~/lib/bot-templates'
import { errorMessage } from '~/lib/errors'

export const Route = createFileRoute('/_app/p/$projectId/bots')({
  validateSearch: z.object({ edit: z.string().optional() }),
  component: Bots,
})

type BotValues = Pick<Doc<'bots'>, 'name' | 'role' | 'instructions' | 'avatar'>

function Bots() {
  const project = useProject()
  const bots = useQuery(
    api.api.bots.list,
    project ? { projectId: project._id } : 'skip',
  )
  const remove = useMutation(api.api.bots.remove)
  const { edit } = Route.useSearch()
  const editing = bots?.find((b) => b._id === edit)

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">{project.name}'s bots</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} can hand work to any of these bots. Changes apply to
            the next reply.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {bots?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No bots yet. Add one from a template, or create your own below.
            </li>
          )}
          {bots?.map((b) => (
            <li
              key={b._id}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium">{b.name}</span>{' '}
                  <span className="text-muted-foreground">· {b.role}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  {b.instructions}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                render={
                  <Link
                    to="/p/$projectId/bots"
                    params={{ projectId: project._id }}
                    search={{ edit: b._id }}
                  />
                }
                nativeButton={false}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${b.name}`}
                onClick={() => void remove({ id: b._id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>

        {bots && !editing && (
          <Templates
            projectId={project._id}
            taken={new Set(bots.map((b) => b.name))}
          />
        )}

        <BotForm
          key={editing?._id ?? 'new'}
          projectId={project._id}
          bot={editing}
        />
      </div>
    </div>
  )
}

/** Built-in templates plus your bots from other projects. Adding one saves a copy. */
function Templates({
  projectId,
  taken,
}: {
  projectId: Id<'projects'>
  taken: Set<string>
}) {
  const save = useMutation(api.api.bots.save)
  const yours = useQuery(api.api.bots.fromOtherProjects, { projectId })
  const [error, add, isPending] = React.useActionState(
    async (
      _previous: string | undefined,
      { name, role, instructions }: BotValues,
    ) => {
      try {
        await save({ projectId, name, role, instructions })
        return undefined
      } catch (e) {
        return errorMessage(e, `Could not add ${name}.`)
      }
    },
    undefined,
  )
  const available = [
    ...BOT_TEMPLATES.map((t) => ({ ...t, from: 'Template' })),
    ...(yours ?? []).map(({ name, role, instructions, projectName }) => ({
      name,
      role,
      instructions,
      from: projectName,
    })),
  ].filter((t) => !taken.has(t.name))
  if (available.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="font-medium">Templates</h2>
        <p className="text-xs text-muted-foreground">
          Add a ready-made bot or one of yours from another project, then edit
          it to fit.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {available.map((t) => (
          <li
            key={`${t.from}:${t.name}`}
            className="flex items-start gap-3 rounded-xl border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium">{t.name}</span>{' '}
                <span className="text-muted-foreground">· {t.role}</span>
              </p>
              <p className="text-xs text-muted-foreground">{t.from}</p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {t.instructions}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Add ${t.name}`}
              disabled={isPending}
              onClick={() => React.startTransition(() => add(t))}
            >
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

type FormState = { error?: string; values?: BotValues }

function BotForm({
  projectId,
  bot,
}: {
  projectId: Id<'projects'>
  bot?: Doc<'bots'>
}) {
  const save = useMutation(api.api.bots.save)
  const navigate = useNavigate()
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        role: String(data.get('role')),
        instructions: String(data.get('instructions')),
        avatar: (data.get('avatar') as Avatar | null) ?? undefined,
      }
      try {
        await save({ projectId, id: bot?._id, ...values })
        if (bot) {
          void navigate({
            to: '/p/$projectId/bots',
            params: { projectId },
            search: {},
          })
        }
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? bot

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {bot ? `Edit ${bot.name}` : 'Create a bot'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={40}
          placeholder="Ivy"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Role
        <Input
          name="role"
          defaultValue={values?.role}
          required
          maxLength={80}
          placeholder="Researcher"
        />
      </label>
      <AvatarPicker
        value={values?.avatar ?? defaultAvatar(values?.name ?? '')}
      />
      <label className="flex flex-col gap-1.5 text-sm">
        What it does and how it thinks
        <Textarea
          name="instructions"
          defaultValue={values?.instructions}
          required
          maxLength={2000}
          placeholder="You dig into questions and summarize what matters."
        />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {bot && (
          <Button
            variant="ghost"
            render={<Link to="/p/$projectId/bots" params={{ projectId }} />}
            nativeButton={false}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {bot ? 'Save changes' : 'Create bot'}
        </Button>
      </div>
    </form>
  )
}
