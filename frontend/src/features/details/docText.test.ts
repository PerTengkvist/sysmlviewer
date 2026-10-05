import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { describe, expect, it } from 'vitest'
import {
  documentationRemarkPlugins,
  interpretDocNewlines,
} from './docText'

function renderDoc(markdown: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: documentationRemarkPlugins,
      children: interpretDocNewlines(markdown),
    }),
  )
}

describe('documentation panel newlines', () => {
  it('turns a literal \\n escape into a newline', () => {
    expect(interpretDocNewlines('one\\ntwo')).toBe('one\ntwo')
    expect(interpretDocNewlines('already\nsplit')).toBe('already\nsplit')
  })

  it('renders a newline as an end of line', () => {
    const html = renderDoc('Hello\nWorld')
    expect(html).toContain('<br')
    expect(html).toContain('Hello')
    expect(html).toContain('World')
  })

  it('renders a literal \\n escape as an end of line', () => {
    const html = renderDoc('Hello\\nWorld')
    expect(html).toContain('<br')
    expect(html).not.toContain('\\n')
  })

  it('keeps a single-line paragraph without a break', () => {
    const html = renderDoc('Hello World')
    expect(html).not.toContain('<br')
  })
})
