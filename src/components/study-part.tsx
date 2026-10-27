import * as React from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { GraduationCapIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { api } from '~/lib/api'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { errorMessage } from '~/lib/errors'
import { attempt } from '~/lib/attempt'
import { CardSkeleton } from '~/components/card-skeleton'

type StudyToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-make_study_set' }
>

/** The deck an assistant made, to study right in the chat. */
export function StudyPart({ part }: { part: StudyToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={GraduationCapIcon}>
        {failed
          ? `Couldn’t make it: ${part.errorText}`
          : 'Writing your study set…'}
      </ToolStatus>
    )
  }
  return <StudyDeck deckId={part.output.deckId} />
}

const GRADES = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
] as const

/** What happened to the item on screen: flipped, or answered right or wrong. */
type Shown = { flipped: true } | { correct: boolean; expected: string }

/**
 * A deck, one item at a time: flash cards flip and you say how it went;
 * quiz questions are picked or answered in your own words, and checked.
 * Each answer schedules the item's next review.
 */
export function StudyDeck({ deckId }: { deckId: string }) {
  const found = useQuery(api.study.deck, { id: deckId })
  const grade = useMutation(api.study.grade)
  const check = useAction(api.study.check)
  const [index, setIndex] = React.useState(0)
  const [shown, setShown] = React.useState<Shown>()
  const [right, setRight] = React.useState(0)
  const [error, setError] = React.useState<string>()
  if (found === undefined) return <CardSkeleton />
  if (found === null) {
    return <p className="px-1.5 text-sm text-muted-foreground">Deck deleted.</p>
  }
  const { deck, items } = found
  const item = items.at(index)
  const next = () => {
    setShown(undefined)
    setError(undefined)
    setIndex(index + 1)
  }
  const answered = (correct: boolean, expected: string) => {
    if (correct) setRight(right + 1)
    setShown({ correct, expected })
  }
  return (
    <section
      aria-label={deck.title}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm text-card-foreground"
    >
      <header className="flex items-center gap-2">
        <GraduationCapIcon className="size-4 text-muted-foreground" />
        <h3 className="flex-1 truncate font-medium">{deck.title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.min(index + 1, items.length)} / {items.length}
        </span>
      </header>
      {!item ? (
        <div className="flex items-center justify-between gap-2">
          <p>
            {deck.format === 'quiz'
              ? `Done: ${right} of ${items.length} right.`
              : 'All done. Cards come back when they’re due.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIndex(0)
              setRight(0)
            }}
          >
            Start over
          </Button>
        </div>
      ) : (
        <>
          <p className="text-base">{item.front}</p>
          {item.kind === 'card' &&
            (shown ? (
              <>
                <p className="rounded-xl bg-muted p-3">{item.back}</p>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map((g) => (
                    <Button
                      key={g.grade}
                      variant={g.grade === 'good' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        void attempt(grade({ id: item._id, grade: g.grade }))
                        next()
                      }}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setShown({ flipped: true })}
              >
                Flip
              </Button>
            ))}
          {item.kind === 'choice' && (
            <div className="flex flex-col gap-2">
              {item.choices?.map((choice, i) => (
                <Button
                  key={choice}
                  variant={shown && i === item.answer ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  disabled={!!shown}
                  onClick={() => {
                    const correct = i === item.answer
                    void attempt(
                      grade({
                        id: item._id,
                        grade: correct ? 'good' : 'again',
                      }),
                    )
                    answered(correct, item.back)
                  }}
                >
                  {choice}
                </Button>
              ))}
            </div>
          )}
          {item.kind === 'short' && !shown && (
            <form
              className="flex gap-2"
              action={async (data) => {
                try {
                  const result = await check({
                    deckId,
                    itemId: item._id,
                    answer: String(data.get('answer')),
                  })
                  answered(result.correct, result.expected)
                } catch (e) {
                  setError(errorMessage(e, 'Couldn’t check that. Try again.'))
                }
              }}
            >
              <Input name="answer" required placeholder="Your answer" />
              <Button type="submit" size="sm">
                Check
              </Button>
            </form>
          )}
          {shown && 'correct' in shown && (
            <div className="flex items-start justify-between gap-2">
              <p role="status">
                <span
                  className={
                    shown.correct ? 'text-emerald-600' : 'text-destructive'
                  }
                >
                  {shown.correct ? 'Right.' : 'Not quite.'}
                </span>{' '}
                {shown.expected}
              </p>
              <Button size="sm" onClick={next}>
                Next
              </Button>
            </div>
          )}
          {error && <p className="text-destructive">{error}</p>}
        </>
      )}
    </section>
  )
}
