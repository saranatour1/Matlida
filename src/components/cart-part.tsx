import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { MinusIcon, PlusIcon, ShoppingCartIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { ChatUIMessage } from '~/components/chat-message'
import { ToolStatus } from '~/components/tool-part'
import { Button } from '~/components/ui/button'
import { money } from '~/lib/money'

type CartToolPart = Extract<
  ChatUIMessage['parts'][number],
  { type: 'tool-add_to_cart' | 'tool-show_cart' }
>

/** The cart after an add, or when asked for: live, by store, each with a Buy button. */
export function CartPart({ part }: { part: CartToolPart }) {
  if (part.state !== 'output-available') {
    const failed = part.state === 'output-error'
    return (
      <ToolStatus failed={failed} icon={ShoppingCartIcon}>
        {failed
          ? `Couldn’t add it: ${part.errorText}`
          : part.type === 'tool-add_to_cart'
            ? 'Adding to your cart…'
            : 'Opening your cart…'}
      </ToolStatus>
    )
  }
  return <Cart />
}

/**
 * Buy opens the store's own checkout, in a new tab, with the items and your
 * details filled in. You pay there; nothing is charged from here.
 */
function Cart() {
  const { projectId } = useParams({ strict: false })
  const cart = useQuery(api.api.shopping.cart)
  const setQuantity = useMutation(api.api.shopping.setQuantity)
  const clearShop = useMutation(api.api.shopping.clearShop)
  if (!cart) return null
  return (
    <section
      aria-label="Your cart"
      className="mx-1.5 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground"
    >
      <div className="flex items-center gap-2">
        <ShoppingCartIcon className="size-4 text-muted-foreground" />
        <p className="font-medium">Your cart</p>
      </div>
      {cart.shops.length === 0 && (
        <p className="text-muted-foreground">Your cart is empty.</p>
      )}
      {cart.shops.map((shop) => (
        <div key={shop.shop} className="flex flex-col gap-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {shop.seller}
          </p>
          {shop.items.map((item) => (
            <div key={item._id} className="flex items-center gap-2">
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="size-10 shrink-0 rounded-md bg-muted object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.title}</p>
                {item.variantTitle && (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.variantTitle}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={item.quantity === 1 ? 'Remove' : 'One fewer'}
                onClick={() =>
                  void setQuantity({
                    id: item._id,
                    quantity: item.quantity - 1,
                  })
                }
              >
                <MinusIcon />
              </Button>
              <span className="w-4 text-center tabular-nums">
                {item.quantity}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="One more"
                onClick={() =>
                  void setQuantity({
                    id: item._id,
                    quantity: item.quantity + 1,
                  })
                }
              >
                <PlusIcon />
              </Button>
              <span className="w-20 text-right tabular-nums">
                {money(item.price * item.quantity, item.currency, true)}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={shop.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Buy at {shop.seller} · {money(shop.subtotal, shop.currency, true)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clearShop({ shop: shop.shop })}
            >
              Bought it, clear
            </Button>
          </div>
        </div>
      ))}
      {cart.shops.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Buy opens the store’s checkout with{' '}
          {cart.hasDetails ? 'your details filled in' : 'these items'}; you pay
          there. Shipping and tax are added at checkout.
          {!cart.hasDetails && projectId && (
            <>
              {' '}
              <Link
                to="/p/$projectId/settings"
                params={{ projectId }}
                hash="shopping"
                className="underline"
              >
                Add your shipping details
              </Link>{' '}
              to have them filled in.
            </>
          )}
        </p>
      )}
    </section>
  )
}
