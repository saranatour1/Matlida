import { SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'

type ProblemCheckToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-problem_check' }
>

const STEPS = [
  'Measuring the problem…',
  'Checking it against the vibes…',
  'Asking Jev, who never panics…',
  'Weighing AI against a real human…',
]

const VERDICTS = {
  ai: { title: 'Poof. I’ve got this.', label: 'AI can do it' },
  ai_then_person: {
    title: 'Half a poof: I’ll prep it, a human signs off.',
    label: 'AI, then a person',
  },
  person: { title: 'This one needs a real person.', label: 'A real person' },
}

const titleOf = (verdict: string) =>
  Object.hasOwn(VERDICTS, verdict)
    ? VERDICTS[verdict as keyof typeof VERDICTS].title
    : verdict

/** Each line comes in after the one before it. */
const step = (i: number) => ({ animationDelay: `${i * 450}ms` })
const appear =
  'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none'

/** The "make my problems go away" analysis: a short, silly scan, then Jev's verdict and odds. */
export function ProblemCheckPart({ part }: { part: ProblemCheckToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={SparklesIcon}>
        {failed
          ? 'The problems refused to go away. Try again.'
          : 'Making your problems go away…'}
      </ToolStatus>
    )
  }
  const { problem, verdict, probabilities, risky } = part.output
  return (
    <section
      aria-label="Make my problems go away analysis"
      className="mx-1.5 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-amber-500" />
        <p className="font-medium">Make-my-problems-go-away analysis™</p>
      </div>
      <p className="text-muted-foreground">“{problem}”</p>
      <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
        {STEPS.map((text, i) => (
          <li key={text} className={appear} style={step(i)}>
            {text}
          </li>
        ))}
      </ol>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full origin-left animate-fill rounded-full bg-amber-500 motion-reduce:animate-none" />
      </div>
      <div
        role="status"
        className={`flex flex-col gap-2 ${appear}`}
        style={step(STEPS.length + 0.5)}
      >
        <p className="text-base font-semibold">{titleOf(verdict)}</p>
        <ul className="flex flex-col gap-1">
          {Object.entries(VERDICTS).map(([key, { label }]) => {
            const odds = Math.round((probabilities[key] ?? 0) * 100)
            return (
              <li key={key} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0">{label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${key === verdict ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
                    style={{ width: `${odds}%` }}
                  />
                </span>
                <span className="w-9 text-right tabular-nums">{odds}%</span>
              </li>
            )
          })}
        </ul>
        {risky && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            Getting this wrong could really hurt, so check with someone who
            knows.
          </p>
        )}
      </div>
    </section>
  )
}
