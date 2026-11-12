import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AutoLayoutDialog } from './AutoLayoutDialog'
import { DEFAULT_AUTO_LAYOUT_DIRECTIVES } from './layout/autoLayoutOptions'

const noop = () => {}

function render(edgeKinds?: { connections: boolean; bindings: boolean; relations: boolean }) {
  return renderToStaticMarkup(
    createElement(AutoLayoutDialog, {
      open: true,
      initial: { ...DEFAULT_AUTO_LAYOUT_DIRECTIVES, edgeKinds },
      onCancel: noop,
      onConfirm: noop,
    }),
  )
}

const checkbox = (html: string, testId: string) =>
  html.match(new RegExp(`<input[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? ''

describe('AutoLayoutDialog edge kinds', () => {
  it('has a checkbox each for connections, bindings and relations', () => {
    const html = render({ connections: true, bindings: false, relations: true })
    expect(html).toContain('Place by')
    expect(checkbox(html, 'al-edges-connections')).toContain('checked')
    expect(checkbox(html, 'al-edges-bindings')).not.toContain('checked')
    expect(checkbox(html, 'al-edges-relations')).toContain('checked')
  })

  it('defaults to connections and bindings without a choice', () => {
    const html = render(undefined)
    expect(checkbox(html, 'al-edges-connections')).toContain('checked')
    expect(checkbox(html, 'al-edges-bindings')).toContain('checked')
    expect(checkbox(html, 'al-edges-relations')).not.toContain('checked')
  })
})

describe('AutoLayoutDialog force grid', () => {
  it('offers Force grid as a simple algorithm', () => {
    const html = render()
    expect(html).toMatch(/<option value="force-grid"[^>]*>Force grid \(shrink to fit\)<\/option>/)
  })
})
