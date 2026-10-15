import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { PlusIcon, XIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/team')({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === 'string' ? search.edit : undefined,
  }),
  component: Team,
})

type Field = Doc<'employees'>['fields'][number]

function Team() {
  const team = useQuery(api.employees.list)
  const remove = useMutation(api.employees.remove)
  const { edit } = Route.useSearch()
  const editing = team?.find((e) => e._id === edit)
  const labels = [
    ...new Set(team?.flatMap((e) => e.fields.map((f) => f.label))),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Matilda can ask any of these people for help. Changes apply to her
            next reply.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {team?.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No employees yet. Add the first one below.
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
                render={<Link to="/team" search={{ edit: e._id }} />}
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

        <EmployeeForm
          key={editing?._id ?? 'new'}
          employee={editing}
          labels={labels}
        />
      </div>
    </div>
  )
}

function EmployeeForm({
  employee,
  labels,
}: {
  employee?: Doc<'employees'>
  labels: string[]
}) {
  const save = useMutation(api.employees.save)
  const navigate = useNavigate()
  const [fields, setFields] = React.useState<Field[]>(employee?.fields ?? [])
  const [error, setError] = React.useState<string>()

  function updateField(index: number, patch: Partial<Field>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setError(undefined)
    try {
      await save({
        id: employee?._id,
        name: String(data.get('name')),
        role: String(data.get('role')),
        instructions: String(data.get('instructions')),
        fields,
      })
      if (employee) {
        void navigate({ to: '/team', search: {} })
      } else {
        form.reset()
        setFields([])
      }
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String(e.data)
          : 'Could not save. Try again.',
      )
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
    >
      <h2 className="font-medium">
        {employee ? `Edit ${employee.name}` : 'Add an employee'}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="name"
          defaultValue={employee?.name}
          required
          maxLength={40}
          placeholder="Nora"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Role
        <Input
          name="role"
          defaultValue={employee?.role}
          required
          maxLength={80}
          placeholder="Head of Sales"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        What they do and how they think
        <Textarea
          name="instructions"
          defaultValue={employee?.instructions}
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
        {fields.map((field, index) => (
          <div key={index} className="flex gap-2">
            <Input
              aria-label="Field name"
              list="field-labels"
              placeholder="Tone"
              maxLength={40}
              value={field.label}
              onChange={(e) => updateField(index, { label: e.target.value })}
            />
            <Input
              aria-label="Field value"
              placeholder="Friendly and concise"
              maxLength={500}
              value={field.value}
              onChange={(e) => updateField(index, { value: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove field"
              onClick={() => setFields(fields.filter((_, i) => i !== index))}
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
          onClick={() => setFields([...fields, { label: '', value: '' }])}
        >
          <PlusIcon data-icon="inline-start" />
          Add field
        </Button>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {employee && (
          <Button
            variant="ghost"
            render={<Link to="/team" />}
            nativeButton={false}
          >
            Cancel
          </Button>
        )}
        <Button type="submit">
          {employee ? 'Save changes' : 'Add employee'}
        </Button>
      </div>
    </form>
  )
}
