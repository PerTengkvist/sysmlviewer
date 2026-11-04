import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import { findPortDefId, portUsageTypeLabel } from './portLocate'

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

describe('findPortDefId', () => {
  const semantic: Record<string, SemanticElement> = {
    P: el('P', 'package'),
    'P::hport': el('P::hport', 'port', { parentId: 'P', name: 'hport' }),
    'P::hport::hport_l1': el('P::hport::hport_l1', 'port', {
      parentId: 'P::hport',
      name: 'hport_l1',
      typeRef: 'l1',
    }),
    'P::l1': el('P::l1', 'port', { parentId: 'P', name: 'l1' }),
    'P::Parent::layered_port': el('P::Parent::layered_port', 'port', {
      parentId: 'P::Parent',
      name: 'layered_port',
      typeRef: 'hport',
    }),
  }

  it('resolves by simple name, preferring package-level defs', () => {
    expect(findPortDefId(semantic, 'hport')).toBe('P::hport')
    expect(findPortDefId(semantic, 'l1')).toBe('P::l1')
  })

  it('resolves by qualified id', () => {
    expect(findPortDefId(semantic, 'P::hport')).toBe('P::hport')
  })

  it('does not treat nested typed ports as defs', () => {
    expect(findPortDefId(semantic, 'hport_l1')).toBeNull()
  })

  it('returns null when missing', () => {
    expect(findPortDefId(semantic, 'missing')).toBeNull()
    expect(findPortDefId(semantic, null)).toBeNull()
  })
})

describe('portUsageTypeLabel', () => {
  it('returns typeRef for port usages', () => {
    expect(portUsageTypeLabel({ kind: 'port', typeRef: 'hport' })).toBe('hport')
  })

  it('returns null without typeRef or for other kinds', () => {
    expect(portUsageTypeLabel({ kind: 'port', typeRef: null })).toBeNull()
    expect(portUsageTypeLabel({ kind: 'part', typeRef: 'X' })).toBeNull()
  })
})
