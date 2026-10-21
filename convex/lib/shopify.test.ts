import { afterEach, expect, test, vi } from 'vitest'
import { checkoutLink, lookupVariant, searchProducts } from './shopify'

afterEach(() => {
  vi.unstubAllGlobals()
})

const dripper = {
  id: 'gid://shopify/p/abc',
  title: 'V60 Ceramic Dripper',
  url: 'https://hario.example/products/v60',
  media: [{ type: 'image', url: 'https://cdn.shopify.com/v60.jpg' }],
  rating: { value: 4.9, count: 261 },
  variants: [
    {
      id: 'gid://shopify/ProductVariant/111',
      title: 'White',
      price: { amount: 3500, currency: 'USD' },
      list_price: { amount: 4000, currency: 'USD' },
      checkout_url: 'https://hario.example/cart/111:1?_gsid=x',
      availability: { available: true },
      seller: { name: 'Hario USA' },
    },
  ],
}

function catalog(structuredContent: unknown) {
  const fetch = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      Response.json({ jsonrpc: '2.0', id: 1, result: { structuredContent } }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

test('a search asks for what ships to you, and keeps only offers with a price and a cart link', async () => {
  const fetch = catalog({
    products: [
      dripper,
      {
        ...dripper,
        id: 'gid://shopify/p/none',
        variants: [{ id: 'v', title: 'x' }],
      },
    ],
  })
  const offers = await searchProducts({
    query: 'pour over',
    country: 'AE',
    maxPrice: 5000,
    limit: 4,
  })
  expect(offers).toEqual([
    {
      productId: 'gid://shopify/p/abc',
      variantId: 'gid://shopify/ProductVariant/111',
      title: 'V60 Ceramic Dripper',
      variantTitle: 'White',
      image: 'https://cdn.shopify.com/v60.jpg',
      url: 'https://hario.example/products/v60',
      price: 3500,
      listPrice: 4000,
      currency: 'USD',
      available: true,
      rating: 4.9,
      ratingCount: 261,
      seller: 'Hario USA',
      shop: 'https://hario.example',
      variantNumber: '111',
    },
  ])
  const body = JSON.parse(fetch.mock.calls[0][1]?.body as string) as {
    params: { name: string; arguments: { catalog: unknown } }
  }
  expect(body.params.name).toBe('search_catalog')
  expect(body.params.arguments.catalog).toMatchObject({
    query: 'pour over',
    filters: { ships_to: { country: 'AE' }, price: { max: 5000 } },
    pagination: { limit: 4 },
  })
})

test('a lookup finds the exact variant, or nothing', async () => {
  catalog({ products: [dripper] })
  expect(await lookupVariant('gid://shopify/ProductVariant/111')).toMatchObject(
    { price: 3500, variantNumber: '111' },
  )
  expect(await lookupVariant('gid://shopify/ProductVariant/999')).toBeNull()
})

test("the checkout link carries the items and fills in the buyer's details", () => {
  const link = new URL(
    checkoutLink(
      'https://hario.example',
      [
        { variantNumber: '111', quantity: 2 },
        { variantNumber: '222', quantity: 1 },
      ],
      {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        address1: '1 Main St',
        city: 'Dubai',
        zip: '00000',
        country: 'AE',
      },
    ),
  )
  expect(link.origin + link.pathname).toBe(
    'https://hario.example/cart/111:2,222:1',
  )
  expect(link.searchParams.get('checkout[email]')).toBe('ada@example.com')
  expect(link.searchParams.get('checkout[shipping_address][city]')).toBe(
    'Dubai',
  )
  expect(link.searchParams.has('checkout[shipping_address][address2]')).toBe(
    false,
  )
  expect(
    checkoutLink(
      'https://hario.example',
      [{ variantNumber: '1', quantity: 1 }],
      null,
    ),
  ).toBe('https://hario.example/cart/1:1')
})

test("a variant named after its product, or Default Title, isn't repeated", async () => {
  catalog({
    products: [
      {
        ...dripper,
        variants: [{ ...dripper.variants[0], title: dripper.title }],
      },
      {
        ...dripper,
        id: 'gid://shopify/p/def',
        variants: [
          { ...dripper.variants[0], id: 'v2', title: 'Default Title' },
        ],
      },
    ],
  })
  const offers = await searchProducts({ query: 'dripper', limit: 2 })
  expect(offers.map((o) => o.variantTitle)).toEqual([undefined, undefined])
})
