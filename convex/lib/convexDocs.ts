const DOCS = 'https://docs.convex.dev'

export type DocPage = { title: string; path: string; about: string }

/** The pages listed in the docs' `llms.txt`: `- [Title](/path.md): about`. */
export const parseIndex = (llmsTxt: string): Array<DocPage> => {
  return [
    ...llmsTxt.matchAll(/^- \[([^\]]+)\]\((\/[^)]+\.md)\):?\s*(.*)$/gm),
  ].map(([, title, path, about]) => ({ title, path, about }))
}

/** The `n` pages whose title, path and summary share the most words with `query`. ponytail: word overlap, fine for ~500 pages. */
export const rankPages = (pages: Array<DocPage>, query: string, n = 3) => {
  const words = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  return pages
    .map((page) => {
      const title = page.title.toLowerCase()
      const rest = `${page.path} ${page.about}`.toLowerCase()
      const score = words.reduce(
        (sum, w) =>
          sum + (title.includes(w) ? 3 : 0) + (rest.includes(w) ? 1 : 0),
        0,
      )
      return { page, score }
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((p) => p.page)
}

/** The best Convex docs pages for `query`, as markdown, so answers use today's APIs. */
export const searchConvexDocs = async (
  query: string,
  abortSignal?: AbortSignal,
) => {
  const index = await fetch(`${DOCS}/llms.txt`, { signal: abortSignal })
  if (!index.ok) throw new Error('The Convex docs are not answering right now.')
  const pages = rankPages(parseIndex(await index.text()), query)
  return await Promise.all(
    pages.map(async ({ title, path }) => {
      const page = await fetch(`${DOCS}${path}`, { signal: abortSignal })
      const markdown = page.ok ? await page.text() : ''
      return {
        title,
        url: `${DOCS}${path.replace(/\.md$/, '')}`,
        markdown: markdown.slice(0, 12_000),
      }
    }),
  )
}
