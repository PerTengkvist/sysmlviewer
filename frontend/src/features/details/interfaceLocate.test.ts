import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  ancestorIdsForLocate,
  findInterfaceDefId,
  interfaceUsageKindLabel,
} from './interfaceLocate'

function el(
  id: string,
  kind: SemanticElement['kind'],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop() || id,
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  }
}

describe('findInterfaceDefId', () => {
  const semantic: Record<string, SemanticElement> = {
    'P::itf_y': el('P::itf_y', 'interface', { parentId: 'P', name: 'itf_y' }),
    'P::x': el('P::x', 'interface', {
      parentId: 'P',
      name: 'x',
      typeRef: 'itf_y',
      sourceId: 'P::a',
      targetId: 'P::b',
    }),
  }

  it('resolves by simple name, ignoring usages', () => {
    expect(findInterfaceDefId(semantic, 'itf_y')).toBe('P::itf_y')
  })

  it('resolves by qualified id', () => {
    expect(findInterfaceDefId(semantic, 'P::itf_y')).toBe('P::itf_y')
  })

  it('returns null when missing', () => {
    expect(findInterfaceDefId(semantic, 'missing')).toBeNull()
  })
})

describe('ancestorIdsForLocate', () => {
  it('lists parents from root to parent of target', () => {
    const semantic: Record<string, SemanticElement> = {
      P: el('P', 'package'),
      'P::A': el('P::A', 'part', { parentId: 'P' }),
      'P::A::itf': el('P::A::itf', 'interface', { parentId: 'P::A' }),
    }
    expect(ancestorIdsForLocate(semantic, 'P::A::itf')).toEqual(['P', 'P::A'])
  })
})

describe('interfaceUsageKindLabel', () => {
  it('returns typeRef for usages', () => {
    expect(
      interfaceUsageKindLabel({
        kind: 'interface',
        typeRef: 'itf_y',
        sourceId: 'a',
        targetId: 'b',
      }),
    ).toBe('itf_y')
  })

  it('returns null for defs and other kinds', () => {
    expect(
      interfaceUsageKindLabel({
        kind: 'interface',
        typeRef: null,
        sourceId: null,
        targetId: null,
      }),
    ).toBeNull()
    expect(interfaceUsageKindLabel({ kind: 'connection' })).toBeNull()
  })
})
