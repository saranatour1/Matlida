const quality = (accept: string, types: Array<string>) =>
  Math.max(
    0,
    ...accept.split(',').map((part) => {
      const [type, ...params] = part
        .split(';')
        .map((piece) => piece.trim().toLowerCase())
      if (!types.includes(type)) return 0
      const q = params.find((param) => param.startsWith('q='))
      return q ? Number(q.slice(2)) || 0 : 1
    }),
  )

/**
 * Whether a request asks for markdown at least as much as for HTML. Browsers
 * never name text/markdown, so they keep getting HTML.
 */
export const wantsMarkdown = (accept: string | null) => {
  if (!accept) return false
  const markdown = quality(accept, ['text/markdown'])
  // ponytail: wildcards count as HTML even when text/html is named lower, so a mixed header falls back to HTML.
  return (
    markdown > 0 && markdown >= quality(accept, ['text/html', 'text/*', '*/*'])
  )
}
