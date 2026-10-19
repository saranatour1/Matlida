import * as React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import {
  PortraitPicker,
  portraitFromForm,
  portraitOf,
} from '~/components/bot-avatar'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'

type ProjectValues = Pick<
  Doc<'projects'>,
  'name' | 'brief' | 'guidelines' | 'portrait'
>
type FormState = { error?: string; values?: ProjectValues }

/** Creates a workspace, or edits one when `project` is given. */
export function ProjectForm({ project }: { project?: Doc<'projects'> }) {
  const save = useMutation(api.api.projects.save)
  const navigate = useNavigate()
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        brief: String(data.get('brief')),
        guidelines: String(data.get('guidelines')),
        portrait: portraitFromForm(data),
      }
      try {
        const id = await save({ id: project?._id, ...values })
        void navigate({ to: '/p/$projectId', params: { projectId: id } })
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? project

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {project ? `Edit ${project.name}` : 'New workspace'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Lead assistant name
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={40}
          placeholder="Matilda"
        />
      </label>
      <PortraitPicker
        defaultValue={portraitOf({
          portrait: values?.portrait,
          name: values?.name ?? 'Matilda',
        })}
      />
      <label className="flex flex-col gap-1.5 text-sm">
        Brief
        <Textarea
          name="brief"
          defaultValue={values?.brief}
          maxLength={2000}
          placeholder="A small coffee roastery selling online. This quarter: launch subscriptions."
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Guidelines (the lead and every bot always follow these)
        <Textarea
          name="guidelines"
          defaultValue={values?.guidelines}
          maxLength={2000}
          placeholder="Answer in British English. Never promise delivery dates. Keep budgets under $5k unless asked."
        />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {project && (
          <Button
            variant="ghost"
            render={
              <Link to="/p/$projectId" params={{ projectId: project._id }} />
            }
            nativeButton={false}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {project ? 'Save changes' : 'Create workspace'}
        </Button>
      </div>
    </form>
  )
}
