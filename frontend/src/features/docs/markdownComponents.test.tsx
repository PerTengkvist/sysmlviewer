import { createElement, type MouseEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { describe, expect, it, vi } from 'vitest'
import {
  createMarkdownComponents,
  markdownComponents,
} from './markdownComponents'

function renderMd(
  markdown: string,
  components = markdownComponents,
): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      components,
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

describe('createMarkdownComponents doc links', () => {
  const current = 'physical_architecture/docs/datacenter_parts.GpuUnit.md'

  it('calls onOpenDoc with the resolved path for an internal .md link', () => {
    const onOpenDoc = vi.fn()
    const components = createMarkdownComponents({ currentDocPath: current, onOpenDoc })
    const A = components.a
    expect(A).toBeTypeOf('function')
    const el = (A as (p: { href?: string; children?: unknown }) => {
      props: { onClick?: (e: Pick<MouseEvent, 'preventDefault'>) => void }
    })({
      href: 'datacenter_racks.GpuRack.md',
      children: 'GpuRack',
    })
    const preventDefault = vi.fn()
    el.props.onClick?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onOpenDoc).toHaveBeenCalledWith(
      'physical_architecture/docs/datacenter_racks.GpuRack.md',
    )
  })

  it('does not call onOpenDoc for external links and opens in a new tab', () => {
    const onOpenDoc = vi.fn()
    const components = createMarkdownComponents({ currentDocPath: current, onOpenDoc })
    const html = renderMd('[ext](https://example.com/a.md)', components)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('href="https://example.com/a.md"')

    const A = components.a as (p: {
      href?: string
      children?: unknown
    }) => { props: { onClick?: unknown } }
    const el = A({ href: 'https://example.com/a.md', children: 'ext' })
    expect(el.props.onClick).toBeUndefined()
    expect(onOpenDoc).not.toHaveBeenCalled()
  })
})
