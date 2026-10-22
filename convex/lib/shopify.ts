import { z } from 'zod'

/** Shopify's Global Catalog over UCP: products from every Shopify store, with prices, stock and cart links. */
const CATALOG = 'https://catalog.shopify.com/api/ucp/mcp'

/**
 * ponytail: Shopify's example agent profile and anonymous requests, which
 * have the lowest rate limits. For production, host our own profile and send
 * a Dev Dashboard token (shopify.dev/docs/agents/profiles/auth-and-rate-limiting).
 */
const PROFILE =
  'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json'

const zMoney = z.object({ amount: z.number(), currency: z.string() })
const zVariant = z.object({
  id: z.string(),
  title: z.string().optional(),
  price: zMoney.optional(),
  list_price: zMoney.optional(),
  checkout_url: z.string().optional(),
  availability: z.object({ available: z.boolean() }).optional(),
  seller: z.object({ name: z.string() }).optional(),
})
/** A web link, or nothing: a store's own `javascript:` or `data:` link never reaches a card. */
const zWebUrl = z
  .url({ protocol: /^https?$/ })
  .optional()
  .catch(undefined)
const zProduct = z.object({
  id: z.string(),
  title: z.string(),
  url: zWebUrl,
  media: z.array(z.object({ url: zWebUrl })).optional(),
  options: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(
          z.object({ label: z.string(), available: z.boolean().optional() }),
        ),
      }),
    )
    .optional(),
  variants: z.array(zVariant),
  rating: z
    .object({ value: z.number(), count: z.number().optional() })
    .optional(),
})
type Product = z.infer<typeof zProduct>
type Variant = z.infer<typeof zVariant>

async function call(tool: string, catalog: Record<string, unknown>) {
  const response = await fetch(CATALOG, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: { meta: { 'ucp-agent': { profile: PROFILE } }, catalog },
      },
    }),
  })
  if (!response.ok) throw new Error(`Shopify catalog ${response.status}`)
  const body = (await response.json()) as {
    result?: { structuredContent?: unknown }
    error?: { message?: string }
  }
  if (body.error) throw new Error(`Shopify catalog: ${body.error.message}`)
  return body.result?.structuredContent
}

/** One variant you can buy: what it is, its price in minor units, and the store's cart link for it. */
export type Offer = {
  productId: string
  variantId: string
  title: string
  variantTitle?: string
  image?: string
  url?: string
  /** Minor units, like cents. */
  price: number
  listPrice?: number
  currency: string
  available: boolean
  rating?: number
  ratingCount?: number
  seller: string
  /** The store's origin, like https://example.com, where its checkout is. */
  shop: string
  /** The number in the store's cart link, `/cart/{variantNumber}:1`. */
  variantNumber: string
}

/** An offer from a catalog variant, or null without a price or a cart link on the store. */
function toOffer(product: Product, variant: Variant): Offer | null {
  if (!variant.price || !variant.checkout_url) return null
  const link = new URL(variant.checkout_url)
  const number = /^\/cart\/(\d+):/.exec(link.pathname)?.[1]
  if (link.protocol !== 'https:' || !number) return null
  return {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    // Single-variant products repeat the title, or say "Default Title".
    variantTitle:
      variant.title &&
      variant.title !== 'Default Title' &&
      variant.title !== product.title
        ? variant.title
        : undefined,
    image: product.media?.[0]?.url,
    url: product.url,
    price: variant.price.amount,
    listPrice: variant.list_price?.amount,
    currency: variant.price.currency,
    available: variant.availability?.available ?? true,
    rating: product.rating?.value,
    ratingCount: product.rating?.count,
    seller: variant.seller?.name ?? link.hostname,
    shop: link.origin,
    variantNumber: number,
  }
}

/** Products matching `query` that ship to `country`, one offer each: the first variant in stock. */
export async function searchProducts({
  query,
  country,
  maxPrice,
  minRating,
  limit,
}: {
  query: string
  country?: string
  /** Minor units. */
  maxPrice?: number
  minRating?: number
  limit: number
}) {
  const found = await call('search_catalog', {
    query,
    context: country ? { address_country: country } : undefined,
    filters: {
      available: true,
      ...(country && { ships_to: { country } }),
      ...(maxPrice && { price: { max: maxPrice } }),
      ...(minRating && { rating: { variant: { min: minRating } } }),
    },
    pagination: { limit },
  })
  const { products } = z.object({ products: z.array(zProduct) }).parse(found)
  return products.flatMap((product) => {
    const variant = product.variants.find(
      (v) => v.availability?.available !== false,
    )
    const offer = variant && toOffer(product, variant)
    return offer ? [offer] : []
  })
}

/** A product's options (sizes, colors) and the variants matching `selected`. */
export async function productOptions(
  productId: string,
  selected: Array<{ name: string; label: string }>,
  country?: string,
) {
  const found = await call('get_product', {
    id: productId,
    selected,
    context: country ? { address_country: country } : undefined,
  })
  const { product } = z.object({ product: zProduct }).parse(found)
  return {
    title: product.title,
    options: product.options ?? [],
    variants: product.variants.flatMap((v) => {
      const offer = toOffer(product, v)
      return offer ? [offer] : []
    }),
  }
}

/** The current offer for one variant, or null when the catalog no longer has it. */
export async function lookupVariant(variantId: string, country?: string) {
  const found = await call('lookup_catalog', {
    ids: [variantId],
    context: country ? { address_country: country } : undefined,
  })
  const { products } = z.object({ products: z.array(zProduct) }).parse(found)
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === variantId)
    if (variant) return toOffer(product, variant)
  }
  return null
}

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
export function checkoutLink(
  shop: string,
  items: Array<{ variantNumber: string; quantity: number }>,
  buyer: Buyer | null,
) {
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
