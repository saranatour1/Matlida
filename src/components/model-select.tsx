import {
  CHAT_MODELS,
  EFFORTS,
  MODELS,
  isListedModel,
} from '../../convex/lib/models'
import type { Effort } from '../../convex/lib/models'
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
  const listed = isListedModel(defaultValue)
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      Model
      <select
        name={name}
        defaultValue={listed ? defaultValue : MODELS.chat}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        {Object.entries(CHAT_MODELS).map(([id, m]) => (
          <option key={id} value={id}>
            {m.name} · {m.maker}
            {id === MODELS.chat ? ' (default)' : ''}
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

/** Picks how hard an assistant works on a reply, for a form. Read it back with `effortFromForm`. */
export function EffortSelect({
  name,
  defaultValue,
}: {
  name: string
  defaultValue?: Effort
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      Effort
      <select
        name={name}
        defaultValue={defaultValue ?? 'medium'}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        {(Object.keys(EFFORTS) as Array<Effort>).map((e) => (
          <option key={e} value={e}>
            {EFFORTS[e].name} · {EFFORTS[e].note}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The effort a form picked with `EffortSelect`, or undefined for medium. */
export function effortFromForm(
  data: FormData,
  name = 'effort',
): Effort | undefined {
  const picked = data.get(name)
  return picked === 'low' || picked === 'high' ? picked : undefined
}
