import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartHeaderIcon, partStereotypeKeyword } from './PartNode'

describe('partStereotypeKeyword', () => {
  it('defaults to part or package', () => {
    expect(partStereotypeKeyword({ kind: 'part' })).toBe('part')
    expect(partStereotypeKeyword({ kind: 'package' })).toBe('package')
  })

  it('replaces part with metadata keywords', () => {
    expect(
      partStereotypeKeyword({
        kind: 'part',
        metadataKeywords: ['mystereotype'],
      }),
    ).toBe('mystereotype')
    expect(
      partStereotypeKeyword({
        kind: 'part',
        metadataKeywords: ['a', 'b'],
      }),
    ).toBe('a, b')
  })
})

describe('PartHeaderIcon', () => {
  it('renders data-testid part-icon for an allowlisted name', () => {
    const html = renderToStaticMarkup(
      createElement(PartHeaderIcon, { iconName: 'cpu' }),
    )
    expect(html).toContain('data-testid="part-icon"')
    expect(html).toContain('part-node-icon')
  })

  it('renders nothing for an unknown iconName', () => {
    const html = renderToStaticMarkup(
      createElement(PartHeaderIcon, { iconName: 'not-a-real-icon' }),
    )
    expect(html).toBe('')
  })
})
