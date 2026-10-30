import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { syncUseCaseAnchors } from './syncUseCaseAnchors'

function uc(
  id: string,
  x: number,
  y: number,
  anchors?: BoundaryAnchor[],
): Node {
  return {
    id,
    type: 'useCase',
    position: { x, y },
    style: { width: 168, height: 72 },
    data: { label: id, artifactId: id, anchors: anchors ?? [] },
  }
}

function actor(
  id: string,
  x: number,
  y: number,
  anchors?: BoundaryAnchor[],
): Node {
  return {
    id,
    type: 'actor',
    position: { x, y },
    style: { width: 88, height: 108 },
    data: { label: id, artifactId: id, anchors: anchors ?? [] },
  }
}

function includeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: 'a-right',
    targetHandle: 'target:a-left',
    type: 'sysml',
    data: { relationKind: 'include', routing: 'direct' },
  }
}

function useEdge(actorId: string, useCaseId: string): Edge {
  return {
    id: `use:${actorId}->${useCaseId}`,
    source: actorId,
    target: useCaseId,
    sourceHandle: 'out',
    targetHandle: 'target:a-left',
    type: 'straight',
    data: {},
  }
}

type AnchorData = { anchors?: BoundaryAnchor[] }

describe('syncUseCaseAnchors', () => {
  it('gives a use case one anchor per include/extend end, no default a-* anchors', () => {
    const nodes = [uc('P::Login', 100, 100), uc('P::Auth', 400, 100)]
    const edges = [
      includeEdge('P::inc1', 'P::Login', 'P::Auth'),
      {
        id: 'P::ext1',
        source: 'P::Auth',
        target: 'P::Login',
        sourceHandle: 'a-left',
        targetHandle: 'target:a-right',
        type: 'sysml',
        data: { relationKind: 'dependency', routing: 'direct' },
      },
    ]

    const { nodes: next } = syncUseCaseAnchors(nodes, edges)
    const login = (next.find((n) => n.id === 'P::Login')!.data as AnchorData)
      .anchors!
    const auth = (next.find((n) => n.id === 'P::Auth')!.data as AnchorData)
      .anchors!

    expect(login.map((a) => a.id).sort()).toEqual([
      'rel:P::ext1',
      'rel:P::inc1',
    ])
    expect(auth.map((a) => a.id).sort()).toEqual([
      'rel:P::ext1',
      'rel:P::inc1',
    ])
    expect(login.some((a) => a.id.startsWith('a-'))).toBe(false)
  })

  it('gives a use case with no relations an empty anchors list', () => {
    const nodes = [uc('P::Alone', 0, 0)]
    const { nodes: next } = syncUseCaseAnchors(nodes, [])
    expect(
      (next.find((n) => n.id === 'P::Alone')!.data as AnchorData).anchors,
    ).toEqual([])
  })

  it('preserves saved side/offset for an existing rel id; new relation gets facing + spread', () => {
    const saved: BoundaryAnchor = {
      id: 'rel:P::inc1',
      side: 'top',
      offset: 0.2,
    }
    const nodes = [
      uc('P::Login', 100, 100, [saved]),
      uc('P::Auth', 400, 100),
      uc('P::Pay', 400, 300),
    ]
    const edges = [
      includeEdge('P::inc1', 'P::Login', 'P::Auth'),
      includeEdge('P::inc2', 'P::Login', 'P::Pay'),
    ]

    const { nodes: next, edges: nextEdges } = syncUseCaseAnchors(nodes, edges, {
      savedAnchors: { 'P::Login': [saved] },
    })
    const login = (next.find((n) => n.id === 'P::Login')!.data as AnchorData)
      .anchors!
    const kept = login.find((a) => a.id === 'rel:P::inc1')!
    expect(kept.side).toBe('top')
    expect(kept.offset).toBe(0.2)

    const created = login.find((a) => a.id === 'rel:P::inc2')!
    // Pay sits down-right of Login — shortest exit is bottom or right.
    expect(['right', 'bottom']).toContain(created.side)

    const inc1 = nextEdges.find((e) => e.id === 'P::inc1')!
    expect(inc1.sourceHandle).toBe('rel:P::inc1')
    expect(inc1.targetHandle).toBe('target:rel:P::inc1')
  })

  it('forceRelayout snaps each end to the nearest boundary point (overlap allowed)', () => {
    const stacked: BoundaryAnchor[] = [
      { id: 'rel:P::inc1', side: 'top', offset: 0.1 },
      { id: 'rel:P::inc2', side: 'top', offset: 0.9 },
    ]
    const nodes = [
      uc('P::Login', 100, 100, stacked),
      uc('P::Auth', 400, 100),
      uc('P::Pay', 400, 100),
    ]
    const edges = [
      includeEdge('P::inc1', 'P::Login', 'P::Auth'),
      includeEdge('P::inc2', 'P::Login', 'P::Pay'),
    ]
    const { nodes: next } = syncUseCaseAnchors(nodes, edges, {
      savedAnchors: { 'P::Login': stacked },
      forceRelayout: true,
    })
    const login = (next.find((n) => n.id === 'P::Login')!.data as AnchorData)
      .anchors!
    expect(login).toHaveLength(2)
    // Both peers share the same centre line → same nearest hit; overlap is OK.
    expect(login.every((a) => a.side === 'right')).toBe(true)
    expect(login[0]!.offset).toBeCloseTo(login[1]!.offset, 5)
    expect(login[0]!.offset).toBeCloseTo(0.5, 5)
  })

  it('places actor association on left when use case is to the left; sourceHandle is rel id', () => {
    // Actor at x=400, use case at x=100 → facing sourceSide left
    const nodes = [actor('P::a', 400, 100), uc('P::Login', 100, 100)]
    const edges = [useEdge('P::a', 'P::Login')]

    const { nodes: next, edges: nextEdges } = syncUseCaseAnchors(nodes, edges)
    const actorAnchors = (
      next.find((n) => n.id === 'P::a')!.data as AnchorData
    ).anchors!
    expect(actorAnchors).toHaveLength(1)
    expect(actorAnchors[0].id).toBe('rel:use:P::a->P::Login')
    expect(actorAnchors[0].side).toBe('left')

    const edge = nextEdges.find((e) => e.id === 'use:P::a->P::Login')!
    expect(edge.sourceHandle).toBe('rel:use:P::a->P::Login')
    expect(edge.sourceHandle).not.toBe('out')
  })

  it('places each actor association on its own nearest boundary hit', () => {
    const nodes = [
      actor('P::a', 24, 100),
      uc('P::Login', 200, 40),
      uc('P::Auth', 200, 200),
    ]
    const edges = [useEdge('P::a', 'P::Login'), useEdge('P::a', 'P::Auth')]

    const { nodes: next } = syncUseCaseAnchors(nodes, edges)
    const actorAnchors = (
      next.find((n) => n.id === 'P::a')!.data as AnchorData
    ).anchors!
    expect(actorAnchors).toHaveLength(2)
    expect(actorAnchors.every((a) => a.side === 'right')).toBe(true)
    const toLogin = actorAnchors.find((a) => a.id.includes('Login'))!
    const toAuth = actorAnchors.find((a) => a.id.includes('Auth'))!
    expect(toLogin.offset).toBeLessThan(toAuth.offset)
  })
})
