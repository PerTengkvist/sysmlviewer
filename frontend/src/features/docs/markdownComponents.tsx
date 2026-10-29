import type { Components } from 'react-markdown'
import type { MouseEvent, ReactNode } from 'react'
import { MermaidDiagram } from './MermaidDiagram'
import { resolveDocLink } from './docLink'

function childText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const props = node.props as { children?: ReactNode }
    return childText(props.children)
  }
  return ''
}

function isMermaidCode(node: ReactNode): boolean {
  if (node == null || typeof node !== 'object' || !('props' in node)) {
    return false
  }
  const props = node.props as { className?: string; children?: ReactNode }
  const className = props.className ?? ''
  return /(^|\s)language-mermaid(\s|$)/.test(className)
}

const mermaidPre: Components['pre'] = ({ children }) => {
  const only =
    Array.isArray(children) && children.length === 1 ? children[0] : children
  if (isMermaidCode(only)) {
    return <MermaidDiagram source={childText(only)} />
  }
  return <pre>{children}</pre>
}

export type MarkdownLinkOptions = {
  currentDocPath: string
  onOpenDoc: (docPath: string) => void
}

/** react-markdown components: mermaid fences + optional internal doc-link intercept. */
export function createMarkdownComponents(
  options?: MarkdownLinkOptions,
): Components {
  const components: Components = {
    pre: mermaidPre,
  }
  if (!options) return components

  const { currentDocPath, onOpenDoc } = options
  components.a = ({ href, children, ...rest }) => {
    const resolved = resolveDocLink(currentDocPath, href)
    if (resolved) {
      return (
        <a
          {...rest}
          href={href}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault()
            onOpenDoc(resolved)
          }}
        >
          {children}
        </a>
      )
    }
    return (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }
  return components
}

/** Default components (mermaid only) for callers without doc-link navigation. */
export const markdownComponents: Components = createMarkdownComponents()
