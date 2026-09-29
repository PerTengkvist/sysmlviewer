import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import { applyRelationEndDrag } from './applyRelationEndDrag'
import type { SysmlEdgeData } from './InternalEdge'

function edge(id: string, data: Partial<SysmlEdgeData> = {}): Edge {
  return {
    id,
    source: 'a',
    target: 'b',
    data: {
      artifactId: id,
      routing: 'direct',
      ...data,
    },
  }
}

describe('applyRelationEndDrag', () => {
  it('updates sourceSide / offset and returns one persist payload', () => {
    const edges = [edge('dep1', { targetSide: 'left', targetOffset: 0.8 })]
    const result = applyRelationEndDrag(
      edges,
      'dep1',
      'source',
      'bottom',
      0.33,
      true,
    )
    const data = result.edges[0].data as SysmlEdgeData
    expect(data.sourceSide).toBe('bottom')
    expect(data.sourceOffset).toBe(0.33)
    expect(data.manualAttachment).toBe(true)
    expect(result.edges[0].sourceHandle).toBe('rel-src-dep1')
    expect(result.persist).toEqual({
      artifactId: 'dep1',
      end: 'source',
      side: 'bottom',
      offset: 0.33,
      companion: { side: 'left', offset: 0.8 },
    })
  })

  it('is idempotent on the same input and describes one persist', () => {
    const edges = [edge('dep1')]
    const once = applyRelationEndDrag(edges, 'dep1', 'target', 'top', 0.2, true)
    const twice = applyRelationEndDrag(
      edges,
      'dep1',
      'target',
      'top',
      0.2,
      true,
    )
    expect(once.persist).toEqual(twice.persist)
    expect(once.edges[0].data).toEqual(twice.edges[0].data)
  })

  it('returns null persist while dragging', () => {
    const edges = [edge('dep1')]
    const result = applyRelationEndDrag(
      edges,
      'dep1',
      'source',
      'right',
      0.5,
      false,
    )
    expect(result.persist).toBeNull()
    expect((result.edges[0].data as SysmlEdgeData).sourceSide).toBe('right')
  })
})
