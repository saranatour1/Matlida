import agentTest from '@convex-dev/agent/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

afterEach(() => {
  vi.unstubAllGlobals()
})

const details = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  address1: '1 Main St',
  city: 'Dubai',
  zip: '00000',
  country: 'ae',
  notes: 'Shoe size 38 EU',
}

function shopify(
  variants: Array<{
    id: string
    price: number
    shop: string
    available?: boolean
  }>,
) {
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    const { params } = JSON.parse(init?.body as string) as {
      params: { arguments: { catalog: { ids: Array<string> } } }
    }
    const products = variants
      .filter((v) => params.arguments.catalog.ids.includes(v.id))
      .map((v) => ({
        id: `p-${v.id}`,
        title: `Item ${v.id}`,
        variants: [
          {
            id: v.id,
            price: { amount: v.price, currency: 'USD' },
            checkout_url: `${v.shop}/cart/${v.id.replace(/\D/g, '')}:1`,
            availability: { available: v.available ?? true },
            seller: { name: new URL(v.shop).hostname },
          },
        ],
      }))
    return Promise.resolve(
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: { products } },
      }),
    )
  })
}

async function setup() {
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'ada@example.com' }),
    await ctx.db.insert('users', {}),
  ])
  return {
    t,
    asAda: t.withIdentity({ subject: ada }),
    asBob: t.withIdentity({ subject: bob }),
  }
}

test('your details are yours, checked, and the country is a two-letter code', async () => {
  const { asAda, asBob } = await setup()
  await asAda.mutation(api.api.shopping.saveDetails, details)
  expect(await asAda.query(api.api.shopping.details, {})).toMatchObject({
    city: 'Dubai',
    country: 'AE',
  })
  expect(await asBob.query(api.api.shopping.details, {})).toBeNull()
  await expect(
    asAda.mutation(api.api.shopping.saveDetails, {
      ...details,
      country: 'UAE',
    }),
  ).rejects.toThrow()
})

test('the cart holds real items by store, and each store checks out with your details', async () => {
  const { asAda, asBob } = await setup()
  shopify([
    {
      id: 'gid://shopify/ProductVariant/1',
      price: 3500,
      shop: 'https://a.example',
    },
    {
      id: 'gid://shopify/ProductVariant/2',
      price: 1200,
      shop: 'https://a.example',
    },
    {
      id: 'gid://shopify/ProductVariant/3',
      price: 999,
      shop: 'https://b.example',
    },
    {
      id: 'gid://shopify/ProductVariant/4',
      price: 500,
      shop: 'https://b.example',
      available: false,
    },
  ])
  await asAda.mutation(api.api.shopping.saveDetails, details)
  await asAda.action(api.api.shopping.addToCart, {
    variantId: 'gid://shopify/ProductVariant/1',
  })
  await asAda.action(api.api.shopping.addToCart, {
    variantId: 'gid://shopify/ProductVariant/1',
  })
  await asAda.action(api.api.shopping.addToCart, {
    variantId: 'gid://shopify/ProductVariant/2',
  })
  await asAda.action(api.api.shopping.addToCart, {
    variantId: 'gid://shopify/ProductVariant/3',
  })
  await expect(
    asAda.action(api.api.shopping.addToCart, {
      variantId: 'gid://shopify/ProductVariant/4',
    }),
  ).rejects.toThrow('That item is out of stock.')
  await expect(
    asAda.action(api.api.shopping.addToCart, {
      variantId: 'gid://shopify/ProductVariant/9',
    }),
  ).rejects.toThrow('That item isn’t for sale anymore.')

  const cart = await asAda.query(api.api.shopping.cart, {})
  expect(cart.hasDetails).toBe(true)
  expect(cart.shops.map((s) => [s.shop, s.subtotal, s.items.length])).toEqual([
    ['https://a.example', 8200, 2],
    ['https://b.example', 999, 1],
  ])
  const link = new URL(cart.shops[0].checkoutUrl)
  expect(link.pathname).toBe('/cart/1:2,2:1')
  expect(link.searchParams.get('checkout[shipping_address][country]')).toBe(
    'AE',
  )
  expect((await asBob.query(api.api.shopping.cart, {})).shops).toEqual([])

  const [item] = cart.shops[1].items
  await expect(
    asBob.mutation(api.api.shopping.setQuantity, { id: item._id, quantity: 3 }),
  ).rejects.toThrow('Item not found.')
  await asAda.mutation(api.api.shopping.setQuantity, {
    id: item._id,
    quantity: 0,
  })
  await asAda.mutation(api.api.shopping.clearShop, {
    shop: 'https://a.example',
  })
  expect((await asAda.query(api.api.shopping.cart, {})).shops).toEqual([])
})

test('a watched price posts in the chat once it drops, and a gone item stops the watch', async () => {
  vi.useFakeTimers()
  const { t } = await setup()
  agentTest.register(t)
  const ada = (await t.run((ctx) => ctx.db.query('users').first()))!._id
  const projectId = await t
    .withIdentity({ subject: ada })
    .mutation(api.api.projects.save, {
      name: 'Matilda',
      brief: '',
      guidelines: '',
    })
  const prices: Record<string, number> = {
    'gid://shopify/ProductVariant/1': 3500,
    'gid://shopify/ProductVariant/2': 2000,
  }
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    const { params } = JSON.parse(init?.body as string) as {
      params: { arguments: { catalog: { ids: Array<string> } } }
    }
    const [id] = params.arguments.catalog.ids
    const products =
      id in prices
        ? [
            {
              id: `p-${id}`,
              title: 'Dripper',
              variants: [
                {
                  id,
                  price: { amount: prices[id], currency: 'USD' },
                  checkout_url: `https://a.example/cart/${id.replace(/\D/g, '')}:1`,
                },
              ],
            },
          ]
        : []
    return Promise.resolve(
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: { products } },
      }),
    )
  })
  const offer = {
    productId: 'p',
    title: 'Dripper',
    price: 3500,
    currency: 'USD',
    available: true,
    seller: 'A',
    shop: 'https://a.example',
  }
  const threadId = await t.mutation(internal.api.threads.start, {
    projectId,
    kind: 'chat',
    title: 'Matilda',
    userId: ada,
  })
  const watchIds = await Promise.all(
    ['1', '2'].map((n) =>
      t.mutation(internal.api.shopping.startWatch, {
        userId: ada,
        projectId,
        threadId,
        offer: {
          ...offer,
          variantId: `gid://shopify/ProductVariant/${n}`,
          variantNumber: n,
        },
        target: 3000,
      }),
    ),
  )
  const status = () =>
    t.run(async (ctx) =>
      Promise.all(
        watchIds.map(
          async (id) => (await ctx.db.get('priceWatches', id))?.status,
        ),
      ),
    )

  // Not due yet: checked just now.
  await t.action(internal.api.shopping.checkPrices, {})
  expect(await status()).toEqual(['watching', 'watching'])

  vi.advanceTimersByTime(24 * 60 * 60_000)
  delete prices['gid://shopify/ProductVariant/1']
  await t.action(internal.api.shopping.checkPrices, {})
  expect(await status()).toEqual(['gone', 'dropped'])
  const { page } = await t
    .withIdentity({ subject: ada })
    .query(api.api.chat.listMessages, {
      threadId,
      paginationOpts: { numItems: 10, cursor: null },
    })
  expect(page.map((m) => m.text).sort()).toEqual([
    "_Dripper isn't for sale anymore, so I've stopped watching it._",
    '📉 **Dripper** is down to **20.00 USD**, at or under the 30.00 USD you wanted. Want me to add it to your cart?',
  ])
  vi.useRealTimers()
})
