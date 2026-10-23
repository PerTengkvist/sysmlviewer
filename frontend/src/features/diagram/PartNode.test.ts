import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PartBodyIcon,
  PartHeaderIcon,
  PART_HEADER_HEIGHT_FALLBACK,
  isPortMultiSelectGesture,
  partBodyIconMaxPx,
  partStereotypeKeyword,
  resolvePartIconPlacement,
} from './PartNode'

describe('isPortMultiSelectGesture', () => {
  it('requires Shift plus Option or move-mode', () => {
    expect(
      isPortMultiSelectGesture({
        altKey: true,
        shiftKey: true,
        moveMode: false,
        editLocked: false,
      }),
    ).toBe(true)
    expect(
      isPortMultiSelectGesture({
        altKey: false,
        shiftKey: true,
        moveMode: true,
        editLocked: false,
      }),
    ).toBe(true)
    expect(
      isPortMultiSelectGesture({
        altKey: true,
        shiftKey: false,
        moveMode: false,
        editLocked: false,
      }),
    ).toBe(false)
    expect(
      isPortMultiSelectGesture({
        altKey: true,
        shiftKey: true,
        moveMode: false,
        editLocked: true,
      }),
    ).toBe(false)
  })
})

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

  it('sets --part-body-icon-max when maxPx is provided', () => {
    const html = renderToStaticMarkup(
      createElement(PartBodyIcon, { iconName: 'cloud', maxPx: 52.5 }),
    )
    expect(html).toContain('--part-body-icon-max:52.5px')
  })
})

describe('partBodyIconMaxPx', () => {
  it('is 1.5 × 50% of body at default part height', () => {
    expect(partBodyIconMaxPx(PART_HEADER_HEIGHT_FALLBACK)).toBe(52.5)
    expect(partBodyIconMaxPx(40)).toBe(52.5)
  })
})

describe('resolvePartIconPlacement', () => {
  it('uses _icon_body in header when children are visible and no _icon', () => {
    expect(
      resolvePartIconPlacement({
        childrenVisible: true,
        iconBodyName: 'cloud',
      }),
    ).toEqual({ headerIcon: 'cloud', bodyIcon: null })
  })

  it('keeps _icon in header when both attrs exist on whitebox', () => {
    expect(
      resolvePartIconPlacement({
        childrenVisible: true,
        iconName: 'battery',
        iconBodyName: 'cloud',
      }),
    ).toEqual({ headerIcon: 'battery', bodyIcon: null })
  })

  it('keeps body icon on blackbox / leaf', () => {
    expect(
      resolvePartIconPlacement({
        childrenVisible: false,
        iconName: 'battery',
        iconBodyName: 'cloud',
      }),
    ).toEqual({ headerIcon: 'battery', bodyIcon: 'cloud' })

    expect(
      resolvePartIconPlacement({
        iconBodyName: 'cloud',
      }),
    ).toEqual({ headerIcon: null, bodyIcon: 'cloud' })
  })
})
