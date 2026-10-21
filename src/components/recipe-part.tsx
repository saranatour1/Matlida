import * as React from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { ChefHatIcon, ClockIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import type { Id } from '../../convex/_generated/dataModel'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { formatAmount } from '~/lib/amounts'
import { errorMessage } from '~/lib/errors'

type RecipeToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-show_recipe' }
>
type Recipe = Extract<RecipeToolPart, { state: 'output-available' }>['output']

/** A recipe that scales to more or fewer servings, and adds its ingredients to the Shopping list. */
export function RecipePart({ part }: { part: RecipeToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ChefHatIcon}>
        {failed ? `Couldn’t show the recipe.` : 'Writing the recipe…'}
      </ToolStatus>
    )
  }
  return <RecipeCard recipe={part.output} />
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { projectId } = useParams({ strict: false })
  const [servings, setServings] = React.useState(recipe.servings)
  const addToList = useMutation(api.api.plans.addToYourList)
  const scale = servings / recipe.servings
  const ingredients = recipe.ingredients.map(({ item, amount, unit }) =>
    [amount && formatAmount(amount * scale), unit, item]
      .filter(Boolean)
      .join(' '),
  )
  const [result, add, isAdding] = React.useActionState(async () => {
    if (!projectId) return undefined
    try {
      await addToList({
        projectId: projectId as Id<'projects'>,
        threadId: recipe.threadId,
        title: 'Shopping list',
        items: ingredients.map((text) => ({ text, section: recipe.title })),
      })
      return 'Added to your Shopping list.'
    } catch (e) {
      return errorMessage(e, 'Could not add them. Try again.')
    }
  }, undefined)

  return (
    <div className="mx-1.5 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-start gap-2">
        <ChefHatIcon className="mt-0.5 size-4 text-muted-foreground" />
        <p className="flex-1 font-medium">{recipe.title}</p>
        {recipe.minutes && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5" />
            {recipe.minutes} min
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Serves
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Fewer servings"
          disabled={servings <= 1}
          onClick={() => setServings(servings - 1)}
        >
          <MinusIcon />
        </Button>
        <span className="w-5 text-center text-sm text-foreground tabular-nums">
          {servings}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="More servings"
          disabled={servings >= 48}
          onClick={() => setServings(servings + 1)}
        >
          <PlusIcon />
        </Button>
      </div>
      <ul className="flex list-disc flex-col gap-0.5 pl-5">
        {ingredients.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isAdding || !projectId}
          onClick={() => React.startTransition(add)}
        >
          Add to shopping list
        </Button>
        {result && (
          <span className="text-xs text-muted-foreground">{result}</span>
        )}
      </div>
      {recipe.source && (
        <p className="text-xs text-muted-foreground">{recipe.source}</p>
      )}
    </div>
  )
}
