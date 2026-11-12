import { describe, expect, it } from 'vitest'
import {
  changedEdgeAttachments,
  changedNodeAnchors,
  preserveExistingGeometry,
  withoutRestoredAttachments,
} from './preserveDiagramGeometry'

describe('preserveExistingGeometry', () => {
  it('keeps positions of artifacts that remain and places only new ones', () => {
    const previousNodes = [
      { id: 'a', position: { x: 10, y: 20 }, style: { width: 40, height: 30 } },
      { id: 'gone', position: { x: 1, y: 1 } },
    ]
    const builtNodes = [
      { id: 'a', position: { x: 0, y: 0 }, style: { width: 10, height: 10 } },
      { id: 'new', position: { x: 5, y: 6 }, style: { width: 8, height: 8 } },
    ]
    const { nodes } = preserveExistingGeometry(builtNodes, [], previousNodes, [])
    expect(nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 10, y: 20 })
    expect(nodes.find((node) => node.id === 'a')?.style).toMatchObject({ width: 40, height: 30 })
    expect(nodes.find((node) => node.id === 'new')?.position).toEqual({ x: 5, y: 6 })
    expect(nodes.some((node) => node.id === 'gone')).toBe(false)
  })

  it('keeps an actor position when the grouped id changes but the name stays', () => {
    const previousNodes = [
      {
        id: 'P::Unlock::Driver',
        type: 'actor',
        position: { x: -40, y: 80 },
        data: { label: 'Driver' },
      },
    ]
    const builtNodes = [
      {
        id: 'P::Brake::Driver',
        type: 'actor',
        position: { x: 24, y: 40 },
        data: { label: 'Driver' },
      },
    ]
    const { nodes } = preserveExistingGeometry(builtNodes, [], previousNodes, [])
    expect(nodes[0].position).toEqual({ x: -40, y: 80 })
  })

  it('keeps edge attachment for a relation whose id changed', () => {
    const previousEdges = [
      {
        id: 'P::Drive::include_2',
        source: 'P::Drive',
        target: 'P::Brake',
        sourceHandle: 'extra-1',
        targetHandle: 'target:extra-2',
        data: { relationKind: 'include', sourceSide: 'top', targetSide: 'left' },
      },
    ]
    const builtEdges = [
      {
        id: 'P::Drive::include_Brake',
        source: 'P::Drive',
        target: 'P::Brake',
        sourceHandle: 'default',
        targetHandle: 'target:default',
        data: { relationKind: 'include', sourceSide: 'right', targetSide: 'left' },
      },
    ]
    const { edges } = preserveExistingGeometry([], builtEdges, [], previousEdges)
    expect(edges[0].sourceHandle).toBe('extra-1')
    expect(edges[0].data?.sourceSide).toBe('top')
  })
})

describe('undo of relation attachments', () => {
  const redrawnEdge = {
    id: 'd1',
    source: 'a',
    target: 'b',
    sourceHandle: 'rel:d1',
    targetHandle: 'target:rel:d1',
    data: {
      relationKind: 'dependency',
      sourceSide: 'top',
      sourceOffset: 0.7,
      sourceAnchorId: 'rel:d1',
      targetSide: 'bottom',
      targetOffset: 0.3,
      targetAnchorId: 'rel:d1',
    },
  }

  it('finds the edges and nodes whose attachment the undo changes', () => {
    const snapEdges = { d1: { routing: 'direct' }, d2: { sourceSide: 'left' } }
    const currentEdges = {
      d1: { routing: 'direct', sourceSide: 'top', sourceAnchorId: 'rel:d1' },
      d2: { sourceSide: 'left' },
      d3: { targetSide: 'right' },
    }
    expect(
      [...changedEdgeAttachments(snapEdges as never, currentEdges as never)].sort(),
    ).toEqual(['d1', 'd3'])
    const snapNodes = { a: { x: 1 }, b: { x: 2, anchors: [{ id: 'a-top' }] } }
    const currentNodes = {
      a: { x: 1, anchors: [{ id: 'rel:d1' }] },
      b: { x: 2, anchors: [{ id: 'a-top' }] },
    }
    expect([...changedNodeAnchors(snapNodes as never, currentNodes as never)]).toEqual(['a'])
  })

  it('lets the rebuilt attachment win for restored edges and anchors', () => {
    const built = [
      {
        ...redrawnEdge,
        sourceHandle: 'a-right',
        targetHandle: 'target:a-left',
        data: { relationKind: 'dependency', sourceSide: 'right', targetSide: 'left' },
      },
    ]
    const builtNodes = [
      { id: 'a', position: { x: 0, y: 0 }, data: { anchors: [{ id: 'a-right' }] } },
    ]
    const screenNodes = [
      { id: 'a', position: { x: 5, y: 5 }, data: { anchors: [{ id: 'rel:d1' }] } },
    ]
    const marked = { edges: new Set(['d1']), nodes: new Set(['a']) }
    const { nodes, edges } = preserveExistingGeometry(
      builtNodes,
      built,
      ...withoutRestoredAttachments(screenNodes, [redrawnEdge], marked),
    )
    expect(edges[0]).toMatchObject({ sourceHandle: 'a-right', targetHandle: 'target:a-left' })
    expect(edges[0]!.data).toMatchObject({ sourceSide: 'right', targetSide: 'left' })
    expect(nodes[0]!.data.anchors).toEqual([{ id: 'a-right' }])
    // The position on screen is still kept.
    expect(nodes[0]!.position).toEqual({ x: 5, y: 5 })
  })

  it('keeps what is on screen for edges the undo did not touch', () => {
    const marked = { edges: new Set<string>(), nodes: new Set<string>() }
    const [, edges] = withoutRestoredAttachments([], [redrawnEdge], marked)
    expect(edges[0]).toBe(redrawnEdge)
  })
})
