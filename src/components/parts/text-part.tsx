import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  MarkdownCode,
  MarkdownPre,
  rehypeInlineCodeProperty,
} from '~/components/markdown-code'

export function TextPart({ text }: { text: string }) {
  if (!text.trim()) {
    return null
  }

  return (
    <div className="typeset typeset-docs px-1.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeInlineCodeProperty]}
        components={{
          code: MarkdownCode,
          pre: MarkdownPre,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
