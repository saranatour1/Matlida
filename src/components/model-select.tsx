import { CHAT_MODELS, MODELS } from '../../convex/lib/models'
import { Input } from '~/components/ui/input'

/**
 * Picks a chat model for a form: one from the list, or any gateway id typed
 * in. The form reads `name` (the list) and `${name}Custom` (the typed id,
 * which wins when filled); `modelFromForm` joins them.
 */
export function ModelSelect({
  name,
  defaultValue,
}: {
  name: string
  defaultValue?: string
}) {
  const listed = CHAT_MODELS.some((m) => m.id === defaultValue)
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      Model
      <select
        name={name}
        defaultValue={listed ? defaultValue : MODELS.chat}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        {CHAT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.maker}
            {m.id === MODELS.chat ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <Input
        name={`${name}Custom`}
        defaultValue={listed ? '' : defaultValue}
        maxLength={80}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Or any gateway model id, like moonshotai/kimi-k2.5"
        className="font-mono text-xs"
      />
    </div>
  )
}

/** The model a form picked with `ModelSelect`, or undefined for the default. */
export function modelFromForm(data: FormData, name = 'model') {
  const custom = String(data.get(`${name}Custom`) ?? '').trim()
  const picked = custom || String(data.get(name) ?? '')
  return picked && picked !== MODELS.chat ? picked : undefined
}
