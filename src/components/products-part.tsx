import * as React from 'react'
import { useAction } from 'convex/react'
import { ShoppingBagIcon, StarIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { errorMessage } from '~/lib/errors'
import { money } from '~/lib/money'

type ProductsToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-find_products' }
>
type Product = Extract<
  ProductsToolPart,
  { state: 'output-available' }
>['output']['products'][number]

/** Products from Shopify stores, each with its price, rating, store and Add to cart. */
export function ProductsPart({ part }: { part: ProductsToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ShoppingBagIcon}>
        {failed
          ? `Couldn’t search the shops: ${part.errorText}`
          : `Looking for ${part.input?.query ?? 'it'}…`}
      </ToolStatus>
    )
  }
  const { products, query } = part.output
  if (products.length === 0) {
    return (
      <p className="px-1.5 text-sm text-muted-foreground">
        Nothing found for “{query}”.
      </p>
    )
  }
  return (
    <div className="mx-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {products.map((product) => (
        <ProductTile key={product.variantId} product={product} />
      ))}
    </div>
  )
}

function ProductTile({ product }: { product: Product }) {
  const addToCart = useAction(api.api.shopping.addToCart)
  const [result, add, isAdding] = React.useActionState(async () => {
    try {
      await addToCart({ variantId: product.variantId })
      return 'Added'
    } catch (e) {
      return errorMessage(e, 'Could not add it.')
    }
  }, undefined)
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground">
      {product.image && (
        <img
          src={product.image}
          alt=""
          loading="lazy"
          className="aspect-square w-full bg-muted object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 font-medium hover:underline"
        >
          {product.title}
        </a>
        {product.variantTitle && (
          <p className="truncate text-xs text-muted-foreground">
            {product.variantTitle}
          </p>
        )}
        <p className="flex items-baseline gap-1.5">
          <span className="font-medium tabular-nums">
            {money(product.price, product.currency)}
          </span>
          {product.listPrice && product.listPrice > product.price && (
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {money(product.listPrice, product.currency)}
            </span>
          )}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {product.rating && (
            <>
              <StarIcon className="size-3 fill-current" />
              {product.rating.toFixed(1)}
              {product.ratingCount ? ` (${product.ratingCount})` : ''} ·
            </>
          )}{' '}
          {product.seller}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            disabled={isAdding || result === 'Added'}
            onClick={() => React.startTransition(add)}
          >
            {result === 'Added' ? 'In your cart' : 'Add to cart'}
          </Button>
        </div>
        {result && result !== 'Added' && (
          <p className="text-xs text-destructive">{result}</p>
        )}
      </div>
    </div>
  )
}
