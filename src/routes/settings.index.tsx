import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  isProvider,
  PROVIDERS,
} from '../../convex/models/aiConnections/providers'
import { errorMessage } from '~/lib/errors'
import { startOpenRouterSignIn } from '~/lib/openrouter'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select'

export const Route = createFileRoute('/settings/')({
  component: Settings,
})

function Settings() {
  const connections = useQuery(api.aiConnections.list)
  const remove = useMutation(api.aiConnections.remove)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            AI accounts your projects can run on. A project uses the Convex AI
            Gateway unless you pick one of these on its settings.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">AI connections</h2>
          <ul className="flex flex-col gap-2">
            {connections?.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No connections yet.
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
                      · {PROVIDERS[c.provider].name} · {c.defaultModel} · key
                      ending {c.last4}
                    </span>
                  </p>
                  {c.status === 'invalid' && (
                    <p className="text-destructive">
                      The provider rejected this key. Remove it and add a new
                      one.
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
        </section>

        <AddKeyForm />

        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-medium">Use your OpenRouter account</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with OpenRouter and your projects use your OpenRouter
            credits. Claude and ChatGPT plans can't be used by other apps, so
            they aren't offered here.
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => void startOpenRouterSignIn()}
          >
            Connect OpenRouter
          </Button>
        </section>
      </div>
    </div>
  )
}

type KeyValues = { provider: string; label: string; defaultModel: string }
type FormState = { error?: string; values?: KeyValues }

function AddKeyForm() {
  const add = useAction(api.aiConnections.add)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: FormState, data: FormData): Promise<FormState> => {
      const values = {
        provider: String(data.get('provider')),
        label: String(data.get('label')),
        defaultModel: String(data.get('defaultModel')),
      }
      if (!isProvider(values.provider)) {
        return { error: 'Pick a provider.', values }
      }
      try {
        await add({
          ...values,
          provider: values.provider,
          apiKey: String(data.get('apiKey')),
        })
        return {}
      } catch (e) {
        return { error: errorMessage(e, 'Could not save the key.'), values }
      }
    },
    {},
  )

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium">Add an API key</h2>
      <label className="flex flex-col gap-1.5 text-sm">
        Provider
        <NativeSelect
          name="provider"
          defaultValue={state.values?.provider ?? 'anthropic'}
        >
          {Object.entries(PROVIDERS).map(([id, provider]) => (
            <NativeSelectOption key={id} value={id}>
              {provider.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <Input
          name="label"
          defaultValue={state.values?.label}
          required
          maxLength={40}
          placeholder="Work Anthropic key"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        API key
        <Input
          name="apiKey"
          type="password"
          autoComplete="off"
          required
          maxLength={500}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Default model
        <Input
          name="defaultModel"
          defaultValue={state.values?.defaultModel}
          required
          maxLength={100}
          placeholder={`e.g. ${PROVIDERS.anthropic.exampleModel} or ${PROVIDERS.openai.exampleModel}`}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        The key is checked with the provider, then stored encrypted. It's never
        shown again.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={isPending} className="self-end">
        Add key
      </Button>
    </form>
  )
}
