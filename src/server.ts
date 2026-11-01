import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import llms from '../public/llms.txt?raw'
import { wantsMarkdown } from '~/lib/content-negotiation'

/** The public pages, for agents that send `Accept: text/markdown`. */
const MARKDOWN = new Map([
  ['/', llms],
  [
    '/sign-in',
    '# Sign in to Matilda\n\nSign in with GitHub in a browser at https://matilda-is-a-bot.app/sign-in. Agents can read [auth.md](https://matilda-is-a-bot.app/auth.md) for how access works.\n',
  ],
  [
    '/sign-up',
    '# Sign up for Matilda\n\nA person creates an account by signing in with GitHub in a browser at https://matilda-is-a-bot.app/sign-in. Agents can read [auth.md](https://matilda-is-a-bot.app/auth.md) for how access works.\n',
  ],
])

const DISCOVERY_LINKS =
  '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc", </llms.txt>; rel="service-doc"'

export default createServerEntry({
  fetch: async (request) => {
    const { pathname } = new URL(request.url)
    const markdown = MARKDOWN.get(pathname)
    const isRead = request.method === 'GET' || request.method === 'HEAD'
    const links = pathname === '/' ? { Link: DISCOVERY_LINKS } : undefined

    // Before the router, which answers 406 to anything that doesn't accept HTML.
    if (markdown && isRead && wantsMarkdown(request.headers.get('Accept'))) {
      return new Response(request.method === 'HEAD' ? null : markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          Vary: 'Accept',
          ...links,
        },
      })
    }

    const response = await handler.fetch(request)
    if (!markdown) return response
    const headers = new Headers(response.headers)
    headers.append('Vary', 'Accept')
    if (links) headers.set('Link', links.Link)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
})
