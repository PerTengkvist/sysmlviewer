import { describe, expect, it } from 'vitest'
import { partStereotypeKeyword } from './PartNode'

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
