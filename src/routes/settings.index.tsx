import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { FunctionArgs } from 'convex/server'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  EMAIL_PROVIDERS,
  isEmailKind,
  type EmailKind,
} from '../../convex/models/emailConnections/providers'
import { errorMessage } from '~/lib/errors'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <h1 className="text-lg font-semibold">Settings</h1>
        <EmailConnections />
      </div>
    </div>
  )
}

function EmailConnections() {
  const connections = useQuery(api.emailConnections.list)
  const remove = useMutation(api.emailConnections.remove)
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Email</h2>
      <p className="text-sm text-muted-foreground">
        Leads can send email from these addresses. You approve every email in
        the chat before it goes out.
      </p>
      <ul className="flex flex-col gap-2">
        {connections?.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No email connections yet.
          </li>
        )}
        {connections?.map((c) => (
          <li
            key={c._id}
            className="flex items-center gap-3 rounded-xl border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium">{c.label}</span>{' '}
                <span className="text-muted-foreground">
                  · {c.from} · {EMAIL_PROVIDERS[c.kind].name}
                </span>
              </p>
              {c.status === 'invalid' && (
                <p className="text-destructive">
                  The provider rejected these credentials. Remove this and add
                  it again.
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${c.label}`}
              onClick={() => void remove({ id: c._id })}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <AddEmailForm />
    </section>
  )
}

type EmailConfig = FunctionArgs<typeof api.emailConnections.add>['config']
type EmailFormState = { error?: string; values?: Record<string, string> }

function readConfig(
  kind: EmailKind,
  values: Record<string, string>,
): EmailConfig {
  switch (kind) {
    case 'resend':
    case 'postmark':
      return { kind }
    case 'mailgun':
      return {
        kind,
        domain: values.domain ?? '',
        region: values.region === 'eu' ? 'eu' : 'us',
      }
    case 'cloudflare':
      return { kind, accountId: values.accountId ?? '' }
    case 'smtp':
      return {
        kind,
        host: values.host ?? '',
        port: Number(values.port),
        username: values.username ?? '',
      }
  }
}

function AddEmailForm() {
  const add = useAction(api.emailConnections.add)
  const [kind, setKind] = React.useState<EmailKind>('resend')
  const [state, submit, isPending] = React.useActionState(
    async (
      _previous: EmailFormState,
      data: FormData,
    ): Promise<EmailFormState> => {
      const values = Object.fromEntries(
        [...data.entries()]
          .filter(([name]) => name !== 'secret')
          .map(([name, value]) => [name, String(value)]),
      )
      try {
        await add({
          label: values.label ?? '',
          from: values.from ?? '',
          secret: String(data.get('secret')),
          config: readConfig(kind, values),
        })
        return {}
      } catch (e) {
        return {
          error: errorMessage(e, 'Could not save the connection.'),
          values,
        }
      }
    },
    {},
  )
  const values = state.values ?? {}

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h3 className="font-medium">Add an email connection</h3>
      <label className="flex flex-col gap-1.5 text-sm">
        Send with
        <NativeSelect
          value={kind}
          onChange={(e) =>
            setKind(isEmailKind(e.target.value) ? e.target.value : 'resend')
          }
        >
          {Object.entries(EMAIL_PROVIDERS).map(([id, provider]) => (
            <NativeSelectOption key={id} value={id}>
              {provider.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Name
          <Input
            name="label"
            defaultValue={values.label}
            required
            maxLength={40}
            placeholder="Work email"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Send from
          <Input
            name="from"
            type="email"
            defaultValue={values.from}
            required
            placeholder="you@yourdomain.com"
          />
        </label>
      </div>
      {kind === 'mailgun' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            Domain
            <Input
              name="domain"
              defaultValue={values.domain}
              required
              placeholder="mg.yourdomain.com"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Region
            <NativeSelect name="region" defaultValue={values.region ?? 'us'}>
              <NativeSelectOption value="us">US</NativeSelectOption>
              <NativeSelectOption value="eu">EU</NativeSelectOption>
            </NativeSelect>
          </label>
        </div>
      )}
      {kind === 'cloudflare' && (
        <label className="flex flex-col gap-1.5 text-sm">
          Account ID
          <Input
            name="accountId"
            defaultValue={values.accountId}
            required
            placeholder="32 characters, from the Cloudflare dashboard"
          />
        </label>
      )}
      {kind === 'smtp' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            Host
            <Input
              name="host"
              defaultValue={values.host}
              required
              placeholder="smtp.yourdomain.com"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Port
            <Input
              name="port"
              type="number"
              defaultValue={values.port ?? '587'}
              required
              min={1}
              max={65535}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-3">
            Username
            <Input
              name="username"
              defaultValue={values.username}
              required
              autoComplete="off"
            />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-sm">
        {EMAIL_PROVIDERS[kind].secret}
        <Input
          name="secret"
          type="password"
          required
          autoComplete="off"
          maxLength={2000}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        We check it with {EMAIL_PROVIDERS[kind].name} first, then store it
        encrypted.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={isPending} className="self-end">
        Add connection
      </Button>
    </form>
  )
}
