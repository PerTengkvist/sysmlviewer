import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PartBodyIcon,
  PartHeaderIcon,
  partStereotypeKeyword,
} from './PartNode'

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
  it('renders Lucide svg for any Lucide name including cloud', () => {
    const html = renderToStaticMarkup(
      createElement(PartHeaderIcon, { iconName: 'cloud' }),
    )
    expect(html).toContain('data-testid="part-icon"')
    expect(html).toContain('part-node-icon')
    expect(html).toContain('data-icon-library="lucide"')
  })

  it('renders img for iconmind/ paths', () => {
    const html = renderToStaticMarkup(
      createElement(PartHeaderIcon, { iconName: 'iconmind/agent' }),
    )
    expect(html).toContain('data-testid="part-icon"')
    expect(html).toContain('data-icon-library="iconmind"')
    expect(html).toContain('/api/icons/iconmind/agent.svg')
  })

  it('renders nothing for an unknown Lucide name', () => {
    const html = renderToStaticMarkup(
      createElement(PartHeaderIcon, { iconName: 'not-a-real-icon' }),
    )
    expect(html).toBe('')
  })
})

describe('PartBodyIcon', () => {
  it('renders centered Lucide body icon for cloud', () => {
    const html = renderToStaticMarkup(
      createElement(PartBodyIcon, { iconName: 'cloud' }),
    )
    expect(html).toContain('data-testid="part-body-icon"')
    expect(html).toContain('part-node-body-icon-wrap')
    expect(html).toContain('part-node-body-icon-box')
    expect(html).toContain('data-icon-library="lucide"')
  })

  it('renders img for iconmind body icons', () => {
    const html = renderToStaticMarkup(
      createElement(PartBodyIcon, { iconName: 'iconmind/agent' }),
    )
    expect(html).toContain('data-testid="part-body-icon"')
    expect(html).toContain('data-icon-library="iconmind"')
    expect(html).toContain('/api/icons/iconmind/agent.svg')
  })

  it('renders nothing for unknown Lucide body icon', () => {
    const html = renderToStaticMarkup(
      createElement(PartBodyIcon, { iconName: 'not-a-real-icon' }),
    )
    expect(html).toBe('')
  })
})
