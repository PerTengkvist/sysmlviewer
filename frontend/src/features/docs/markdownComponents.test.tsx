import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { describe, expect, it } from 'vitest'
import { markdownComponents } from './markdownComponents'

function renderMd(markdown: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      components: markdownComponents,
      children: markdown,
    }),
  )
}

describe('markdownComponents mermaid', () => {
  it('renders a mermaid fence as a diagram container with source preserved', () => {
    const md = [
      '```mermaid',
      'mindmap',
      '  root((MBSE))',
      '    Requirements',
      '```',
    ].join('\n')
    const html = renderMd(md)
    expect(html).toContain('mermaid-diagram')
    expect(html).toContain('data-mermaid-source=')
    expect(html).toContain('mindmap')
    expect(html).toContain('root((MBSE))')
    expect(html).toContain('    Requirements')
    expect(html).not.toMatch(/<pre[^>]*>[\s\S]*language-mermaid/)
  })

  it('keeps a sysml fence as a code block', () => {
    const md = ['```sysml', 'part def Engine;', '```'].join('\n')
    const html = renderMd(md)
    expect(html).toContain('<pre>')
    expect(html).toContain('language-sysml')
    expect(html).toContain('part def Engine;')
    expect(html).not.toContain('mermaid-diagram')
  })
})
