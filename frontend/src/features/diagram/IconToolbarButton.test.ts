import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { IconToolbarButton } from './IconToolbarButton'
import { TOOLBAR_ICONS } from './iconRef'

describe('IconToolbarButton', () => {
  it('renders icon img with title/aria and no visible text label', () => {
    const html = renderToStaticMarkup(
      createElement(IconToolbarButton, {
        icon: TOOLBAR_ICONS.copy,
        title: 'Copy diagram image',
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('title="Copy diagram image"')
    expect(html).toContain('aria-label="Copy diagram image"')
    expect(html).toContain('/icons/interface/copy/outline-regular.svg')
    expect(html).not.toContain('>Copy<')
  })

  it('uses statusLabel for busy/ok feedback', () => {
    const html = renderToStaticMarkup(
      createElement(IconToolbarButton, {
        icon: TOOLBAR_ICONS.copy,
        title: 'Copy',
        statusLabel: 'Copying…',
        onClick: vi.fn(),
      }),
    )
    expect(html).toContain('title="Copying…"')
    expect(html).toContain('aria-label="Copying…"')
  })
})
