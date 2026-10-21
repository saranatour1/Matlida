import * as React from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'

const TOPICS = [
  'World',
  'Middle East',
  'Politics',
  'Business',
  'Tech',
  'AI',
  'Science',
  'Health',
  'Climate',
  'Sports',
  'Culture',
]

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6)

const list = (text: FormDataEntryValue | null) =>
  String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * What news you follow: topic chips, your own topics, regions, what to skip,
 * stories per topic and a daily time. "Save and get the news" asks Matilda for
 * a briefing right after.
 */
export function NewsSettings({
  suggested = [],
  onSaved,
}: {
  suggested?: Array<string>
  onSaved?: () => void
}) {
  const { projectId } = useParams({ strict: false })
  const current = useQuery(api.api.news.settings)
  const save = useMutation(api.api.news.saveSettings)
  const send = useMutation(api.api.chat.sendMessage)
  const [error, submit, isPending] = React.useActionState(
    async (_previous: string | undefined, data: FormData) => {
      if (!projectId) return undefined
      const dailyHour = String(data.get('dailyHour') ?? '')
      try {
        await save({
          projectId,
          topics: [
            ...data.getAll('topic').map(String),
            ...list(data.get('more')),
          ],
          regions: list(data.get('regions')),
          avoid: String(data.get('avoid') ?? ''),
          perTopic: Number(data.get('perTopic')),
          dailyHour: dailyHour ? Number(dailyHour) : undefined,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        if (data.get('then') === 'news') {
          await send({
            projectId,
            prompt: '/news',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
        }
        onSaved?.()
        return undefined
      } catch (e) {
        return errorMessage(e, 'Could not save. Try again.')
      }
    },
    undefined,
  )
  if (current === undefined) return null
  const following = current?.topics ?? suggested
  const custom = following.filter((t) => !TOPICS.includes(t))
  return (
    <form
      key={current?._id ?? 'new'}
      action={submit}
      className="flex flex-col gap-3 text-sm"
    >
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
          Topics
        </legend>
        {TOPICS.map((topic) => (
          <label key={topic}>
            <input
              type="checkbox"
              name="topic"
              value={topic}
              defaultChecked={following.includes(topic)}
              className="peer sr-only"
            />
            <span className="inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-xs peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {topic}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Other topics, comma-separated
        <Input
          name="more"
          defaultValue={custom.join(', ')}
          placeholder="Formula 1, space, my city"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Regions
          <Input
            name="regions"
            defaultValue={current?.regions.join(', ') ?? ''}
            placeholder="Jordan, Europe"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Leave out
          <Input
            name="avoid"
            defaultValue={current?.avoid ?? ''}
            placeholder="celebrity gossip"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Stories per topic
          <select
            name="perTopic"
            defaultValue={current?.perTopic ?? 3}
            className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Daily briefing
          <select
            name="dailyHour"
            defaultValue={current?.dailyHour ?? ''}
            className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground"
          >
            <option value="">Only when I ask</option>
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                Every day at {hour}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" variant="ghost" disabled={isPending}>
          Save
        </Button>
        <Button type="submit" name="then" value="news" disabled={isPending}>
          Save and get the news
        </Button>
      </div>
    </form>
  )
}
