import { Skeleton } from '~/components/ui/skeleton'

/** A card's place while its data loads, so the chat doesn't jump when it arrives. */
export function CardSkeleton() {
  return <Skeleton className="mx-1.5 h-20 max-w-xl rounded-xl" />
}

/** What a card says when the thing it showed was removed. */
export function CardGone({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 text-sm text-muted-foreground">{children}</p>
}
