export type Buyer = {
  email?: string
  firstName?: string
  lastName?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  zip?: string
  country?: string
}

/**
 * The store's checkout with these items, and your details filled in where
 * you gave them. Shopify's cart permalinks take the email and shipping
 * address (shopify.dev/docs/apps/build/checkout/create-cart-permalinks).
 * You pay on the store's own checkout.
 */
export const checkoutLink = (
  shop: string,
  items: Array<{ variantNumber: string; quantity: number }>,
  buyer: Buyer | null,
) => {
  const link = new URL(
    `/cart/${items.map((i) => `${i.variantNumber}:${i.quantity}`).join(',')}`,
    shop,
  )
  const fields: Array<[string, string | undefined]> = [
    ['checkout[email]', buyer?.email],
    ['checkout[shipping_address][first_name]', buyer?.firstName],
    ['checkout[shipping_address][last_name]', buyer?.lastName],
    ['checkout[shipping_address][address1]', buyer?.address1],
    ['checkout[shipping_address][address2]', buyer?.address2],
    ['checkout[shipping_address][city]', buyer?.city],
    ['checkout[shipping_address][province]', buyer?.province],
    ['checkout[shipping_address][zip]', buyer?.zip],
    ['checkout[shipping_address][country]', buyer?.country],
  ]
  for (const [name, value] of fields) {
    if (value) link.searchParams.set(name, value)
  }
  return link.toString()
}
