import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import { nestedPortsOf } from './nestedPorts'

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

describe('nestedPortsOf', () => {
  it('returns direct port children', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::sPort': el('P::sPort', 'port', {
        children: ['P::sPort::sP1', 'P::sPort::sP2'],
      }),
      'P::sPort::sP1': el('P::sPort::sP1', 'port', {
        parentId: 'P::sPort',
        typeRef: 'sP1',
      }),
      'P::sPort::sP2': el('P::sPort::sP2', 'port', {
        parentId: 'P::sPort',
        typeRef: 'sP2',
      }),
    }
    const nested = nestedPortsOf(semantic['P::sPort'], semantic)
    expect(nested.map((p) => p.name)).toEqual(['sP1', 'sP2'])
  })

  it('returns empty for leaf ports and non-ports', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::leaf': el('P::leaf', 'port'),
      'P::part': el('P::part', 'part', { children: ['P::leaf'] }),
    }
    expect(nestedPortsOf(semantic['P::leaf'], semantic)).toEqual([])
    expect(nestedPortsOf(semantic['P::part'], semantic)).toEqual([])
    expect(nestedPortsOf(null, semantic)).toEqual([])
  })
})
