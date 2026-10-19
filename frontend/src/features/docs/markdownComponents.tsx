import type { Components } from 'react-markdown'
import type { ReactNode } from 'react'
import { MermaidDiagram } from './MermaidDiagram'

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

/** react-markdown components that render fenced ```mermaid as diagrams. */
export const markdownComponents: Components = {
  pre({ children }) {
    const only =
      Array.isArray(children) && children.length === 1
        ? children[0]
        : children
    if (isMermaidCode(only)) {
      return <MermaidDiagram source={childText(only)} />
    }
    return <pre>{children}</pre>
  },
}
