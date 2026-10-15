import { Button } from '~/components/ui/button'

const suggestions = [
  {
    label: 'Launch plan',
    prompt:
      'We want to launch a paid tier next month. Get input from the whole team and give me a plan.',
  },
  {
    label: 'Hire or outsource?',
    prompt:
      'Should we hire a second engineer or outsource the mobile app? Check with whoever is relevant.',
  },
  {
    label: 'Pricing',
    prompt:
      'A competitor charges $29/month. Ask finance and marketing what we should charge, and save the recommendation as a doc.',
  },
  {
    label: 'Standup',
    prompt:
      'Run a quick standup: ask everyone for their top priority this week.',
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
