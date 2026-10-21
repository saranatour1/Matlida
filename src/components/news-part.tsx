import * as React from 'react'
import { NewspaperIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { NewsSettings } from '~/components/news-settings'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'

type NewsToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-get_news' }
>
type SetupToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-setup_news' }
>

/** The setup card: choose what you follow before the first briefing. */
export function NewsSetupPart({ part }: { part: SetupToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={NewspaperIcon}>
        {failed ? `Couldn’t open the news setup.` : 'Opening the news setup…'}
      </ToolStatus>
    )
  }
  return (
    <section
      aria-label="News setup"
      className="mx-1.5 flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-center gap-2 text-sm">
        <NewspaperIcon className="size-4 text-muted-foreground" />
        <p className="font-medium">What news do you follow?</p>
      </div>
      <NewsSettings suggested={part.output.suggested} />
    </section>
  )
}

/** The briefing: the last day's top stories by topic, each linked to its source. */
export function NewsPart({ part }: { part: NewsToolPart }) {
  const [editing, setEditing] = React.useState(false)
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={NewspaperIcon}>
        {failed ? `Couldn’t get the news.` : 'Reading the news…'}
      </ToolStatus>
    )
  }
  const { needsSetup, date, sections } = part.output
  if (needsSetup) return null
  return (
    <section
      aria-label="The news"
      className="mx-1.5 flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <NewspaperIcon className="size-4 text-muted-foreground" />
        <p className="flex-1 font-medium">
          The news ·{' '}
          {new Date(date).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Close' : 'Edit topics'}
        </Button>
      </div>
      {editing && <NewsSettings onSaved={() => setEditing(false)} />}
      {sections.map((section) => (
        <div key={section.topic} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {section.topic}
          </p>
          {section.stories.length === 0 && (
            <p className="text-muted-foreground">Nothing found today.</p>
          )}
          {section.stories.map((story) => (
            <div key={story.url}>
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {story.headline}
              </a>
              <p className="text-muted-foreground">
                {story.summary}{' '}
                <span className="text-xs">· {story.source}</span>
              </p>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
