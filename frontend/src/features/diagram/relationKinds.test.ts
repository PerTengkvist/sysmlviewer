import { describe, expect, it } from 'vitest'
import { isRelationElement, isRelationKind } from './relationKinds'

describe('isRelationElement', () => {
  it('treats classic relation kinds as relations', () => {
    expect(isRelationKind('connection')).toBe(true)
    expect(
      isRelationElement({
        kind: 'connection',
        sourceId: 'a',
        targetId: 'b',
      }),
    ).toBe(true)
  })

  it('treats interface usage with ends as a relation', () => {
    expect(isRelationKind('interface')).toBe(false)
    expect(
      isRelationElement({
        kind: 'interface',
        sourceId: 'P::a',
        targetId: 'P::b',
      }),
    ).toBe(true)
  })

  it('keeps interface defs out of relations', () => {
    expect(
      isRelationElement({
        kind: 'interface',
        sourceId: null,
        targetId: null,
      }),
    ).toBe(false)
  })
})
