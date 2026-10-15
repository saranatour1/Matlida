import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import ShikiHighlighter, { rehypeInlineCodeProperty } from 'react-shiki'

import { Button } from '~/components/ui/button'

export { rehypeInlineCodeProperty }

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? CheckIcon : CopyIcon

  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="absolute top-2 right-2 z-10 bg-transparent text-muted-foreground hover:text-foreground"
      onClick={copy}
    >
      <Icon />
    </Button>
  )
}

export function MarkdownCode({
  className,
  children,
  inline,
  ...props
}: MarkdownCodeProps) {
  const { resolvedTheme } = useTheme()
  const code = String(children).replace(/\n$/, '')
  const language = /language-([\w-]+)/.exec(className || '')?.[1]
  const syntaxTheme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light'

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="not-typeset relative mt-[1.25em]">
      {language ? (
        <span className="absolute top-2 right-10 z-10 flex h-6 items-center font-mono text-xs text-muted-foreground">
          {language}
        </span>
      ) : null}
      <CopyButton code={code} />
      <ShikiHighlighter
        language={language || 'text'}
        theme={syntaxTheme}
        delay={100}
        showLanguage={false}
        className="overflow-hidden rounded-lg bg-muted text-[0.875em] leading-normal [&_pre]:bg-muted!"
      >
        {code}
      </ShikiHighlighter>
    </div>
  )
}

/**
 * react-markdown wraps fenced blocks in `<pre><code>`, and Shiki renders its own
 * `<pre>`, so this unwraps the outer one to avoid nested code blocks.
 */
export function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
