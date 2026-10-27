import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { Doc } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'
import { MarkdownEditor } from '~/components/markdown-editor'
import { PageMetrics } from '~/components/page-metrics'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { errorMessage } from '~/lib/errors'
import { attempt } from '~/lib/attempt'

export const Route = createFileRoute('/_app/p/$projectId/pages/$pageId')({
  component: Page,
})

type Saved = { error?: string; saved?: boolean }

/** A report, memo or dashboard: edit it here, or have an assistant keep it up to date. */
function Page() {
  const { projectId, pageId } = Route.useParams()
  const page = useQuery(api.pages.get, { id: pageId })
  const save = useMutation(api.pages.save)
  const remove = useMutation(api.pages.remove)
  const navigate = useNavigate()
  const [state, submit, isPending] = React.useActionState(
    async (_previous: Saved, data: FormData): Promise<Saved> => {
      if (!page) return {}
      try {
        await save({
          id: page._id,
          title: String(data.get('title') ?? ''),
          markdown: String(data.get('markdown') ?? ''),
        })
        return { saved: true }
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.') }
      }
    },
    {},
  )
  if (page === undefined) return null
  if (page === null) {
    return <p className="p-6 text-sm text-muted-foreground">Page not found.</p>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <article
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6"
        aria-label={page.title}
      >
        <form
          key={`${page._id}:${page._creationTime}:${page.updatedBy}`}
          action={submit}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <Input
              name="title"
              defaultValue={page.title}
              aria-label="Title"
              className="h-10 flex-1 border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
            />
            <Badge variant="secondary" className="capitalize">
              {page.kind}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            Last saved by {page.updatedBy}
            {page.refresh && ` · kept up to date every ${page.refresh.every}`}
          </p>
          {page.metrics && page.metrics.length > 0 && (
            <PageMetrics metrics={page.metrics} />
          )}
          <MarkdownEditor
            name="markdown"
            defaultValue={page.markdown}
            placeholder="Write here, or ask an assistant to."
          />
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void attempt(
                  remove({ id: page._id }).then(() =>
                    navigate({
                      to: '/p/$projectId/library',
                      params: { projectId },
                    }),
                  ),
                )
              }
            >
              Delete
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {state.saved && 'Saved.'}
            </span>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </div>
        </form>
        <KeepUpdated page={page} />
      </article>
    </div>
  )
}

function KeepUpdated({ page }: { page: Doc<'pages'> }) {
  const setRefresh = useMutation(api.pages.setRefresh)
  const [state, submit, isPending] = React.useActionState(
    async (_previous: Saved, data: FormData): Promise<Saved> => {
      const every = String(data.get('every'))
      try {
        await setRefresh({
          id: page._id,
          every: every === 'day' || every === 'week' ? every : null,
          instructions: String(data.get('instructions') ?? ''),
        })
        return { saved: true }
      } catch (e) {
        return { error: errorMessage(e, 'Could not save. Try again.') }
      }
    },
    {},
  )
  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
      aria-labelledby="keep-updated"
    >
      <h2 id="keep-updated" className="font-medium">
        Keep it up to date
      </h2>
      <p className="text-muted-foreground">
        The assistant reads your edits, updates what’s out of date, and saves a
        new version.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          name="every"
          aria-label="How often"
          defaultValue={page.refresh?.every ?? ''}
          className="h-9 rounded-md border bg-transparent px-2"
        >
          <option value="">Off</option>
          <option value="day">Every day</option>
          <option value="week">Every week</option>
        </select>
        <Textarea
          name="instructions"
          aria-label="What to update"
          rows={2}
          defaultValue={page.refresh?.instructions ?? ''}
          placeholder="Refresh the numbers and add this week’s news."
          className="flex-1"
        />
      </div>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {state.saved && <span className="text-muted-foreground">Saved.</span>}
        <Button type="submit" variant="outline" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
