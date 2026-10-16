import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { PlusIcon, XIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { useProject } from '~/hooks/use-project'
import { errorMessage } from '~/lib/errors'
import { EMPLOYEE_TEMPLATES } from '~/lib/employee-templates'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/p/$projectId/team')({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === 'string' ? search.edit : undefined,
  }),
  component: Team,
})

type Field = Doc<'employees'>['fields'][number]

function Team() {
  const project = useProject()
  const team = useQuery(
    api.employees.list,
    project ? { projectId: project._id } : 'skip',
  )
  const remove = useMutation(api.employees.remove)
  const { edit } = Route.useSearch()
  const editing = team?.find((e) => e._id === edit)
  const labels = [
    ...new Set(team?.flatMap((e) => e.fields.map((f) => f.label))),
  ]

  if (!project) {
    return project === null ? (
      <p className="p-6 text-sm text-muted-foreground">Project not found.</p>
    ) : null
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">{project.name}'s team</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} can ask any of these people for help. Changes apply
            to the next reply.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {team?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No employees yet. Add one from a template, or create your own
              below.
            </li>
          )}
          {team?.map((e) => (
            <li
              key={e._id}
              className="flex items-start gap-3 rounded-xl border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium">{e.name}</span>{' '}
                  <span className="text-muted-foreground">· {e.role}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  {e.instructions}
                </p>
                {e.fields.length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {e.fields.map((f) => (
                      <div
                        key={f.label}
                        className="flex gap-1 rounded-md bg-muted px-2 py-0.5"
                      >
                        <dt className="font-medium">{f.label}:</dt>
                        <dd className="text-muted-foreground">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                render={
                  <Link
                    to="/p/$projectId/team"
                    params={{ projectId: project._id }}
                    search={{ edit: e._id }}
                  />
                }
                nativeButton={false}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${e.name}`}
                onClick={() => void remove({ id: e._id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>

        {team && !editing && (
          <Templates
            projectId={project._id}
            taken={new Set(team.map((e) => e.name))}
          />
        )}

        <EmployeeForm
          key={editing?._id ?? 'new'}
          projectId={project._id}
          employee={editing}
          labels={labels}
        />
      </div>
    </div>
  )
}

type Template = (typeof EMPLOYEE_TEMPLATES)[number]

function Templates({
  projectId,
  taken,
}: {
  projectId: Id<'projects'>
  taken: Set<string>
}) {
  const save = useMutation(api.employees.save)
  const [error, add, isPending] = React.useActionState(
    async (_previous: string | undefined, template: Template) => {
      try {
        await save({ projectId, ...template, fields: [] })
        return undefined
      } catch (e) {
        return errorMessage(e, `Could not add ${template.name}.`)
      }
    },
    undefined,
  )
  const available = EMPLOYEE_TEMPLATES.filter((t) => !taken.has(t.name))
  if (available.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="font-medium">Templates</h2>
        <p className="text-xs text-muted-foreground">
          Add a ready-made employee, then edit them to fit.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {available.map((t) => (
          <li
            key={t.name}
            className="flex items-start gap-3 rounded-xl border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium">{t.name}</span>{' '}
                <span className="text-muted-foreground">· {t.role}</span>
              </p>
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

type Row = Field & { key: string }
type EmployeeValues = Pick<Doc<'employees'>, 'name' | 'role' | 'instructions'>
type FormState = { error?: string; values?: EmployeeValues }

function withKeys(fields: Field[]): Row[] {
  return fields.map((f) => ({ ...f, key: crypto.randomUUID() }))
}

function EmployeeForm({
  projectId,
  employee,
  labels,
}: {
  projectId: Id<'projects'>
  employee?: Doc<'employees'>
  labels: string[]
}) {
  const save = useMutation(api.employees.save)
  const navigate = useNavigate()
  const [rows, setRows] = React.useState(() => withKeys(employee?.fields ?? []))
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        name: String(data.get('name')),
        role: String(data.get('role')),
        instructions: String(data.get('instructions')),
      }
      const fieldValues = data.getAll('fieldValue').map(String)
      const fields = data
        .getAll('fieldLabel')
        .map((label, i) => ({ label: String(label), value: fieldValues[i] }))
        .filter((f) => f.label.trim() || f.value.trim())
      try {
        await save({ projectId, id: employee?._id, ...values, fields })
        if (employee) {
          void navigate({
            to: '/p/$projectId/team',
            params: { projectId },
            search: {},
          })
        } else {
          setRows([])
        }
        return {}
      } catch (e) {
        setRows(withKeys(fields))
        return { error: errorMessage(e, 'Could not save. Try again.'), values }
      }
    },
    {},
  )
  const values = state.values ?? employee

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">
        {employee ? `Edit ${employee.name}` : 'Add an employee'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="name"
          defaultValue={values?.name}
          required
          maxLength={40}
          placeholder="Nora"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Role
        <Input
          name="role"
          defaultValue={values?.role}
          required
          maxLength={80}
          placeholder="Head of Sales"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        What they do and how they think
        <Textarea
          name="instructions"
          defaultValue={values?.instructions}
          required
          maxLength={2000}
          placeholder="You own the sales pipeline. You think about leads, conversion and deal size."
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">Custom fields</legend>
        <p className="text-xs text-muted-foreground">
          Anything they should always know, like Tone, KPIs or Budget.
        </p>
        <datalist id="field-labels">
          {labels.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <Input
              name="fieldLabel"
              aria-label="Field name"
              list="field-labels"
              placeholder="Tone"
              maxLength={40}
              defaultValue={row.label}
            />
            <Input
              name="fieldValue"
              aria-label="Field value"
              placeholder="Friendly and concise"
              maxLength={500}
              defaultValue={row.value}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove field"
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setRows([...rows, ...withKeys([{ label: '', value: '' }])])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Add field
        </Button>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        {employee && (
          <Button
            variant="ghost"
            render={<Link to="/p/$projectId/team" params={{ projectId }} />}
            nativeButton={false}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {employee ? 'Save changes' : 'Add employee'}
        </Button>
      </div>
    </form>
  )
}
