import { Button } from '~/components/ui/button'

const suggestions = [
  {
    label: 'Plan my week',
    prompt: 'Help me plan my week. Start by asking what I need to get done.',
  },
  {
    label: 'Draft an email',
    prompt:
      'Draft a short, friendly email asking a client to move our meeting to next week.',
  },
  {
    label: 'First steps',
    prompt:
      'Summarize what this project is about and suggest the first three things to do.',
  },
  {
    label: 'Brainstorm',
    prompt: 'Brainstorm ten names for a personal AI assistant.',
  },
]

export function Suggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.label}
          variant="outline"
          size="sm"
          onClick={() => onSelect(suggestion.prompt)}
        >
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}
