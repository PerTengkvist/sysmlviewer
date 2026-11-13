import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { ViewPayload, VisualizationEdge, VisualizationNode } from '../../../api'
import { resolveAnchors, type BoundaryAnchor } from '../boundaryAnchors'
import {
  applyRelationHandlesToNodes,
  buildStructureGraph,
} from '../modes/structure/buildStructureGraph'
import {
  hasRedrawableRelations,
  redrawStructureRelations,
} from './redrawStructureRelations'

type RelHandle = { id: string; type: string; side: string; offset: number }

function req(id: string, x: number, y: number): Node {
  return {
    id,
    type: 'requirement',
    position: { x, y },
    style: { width: 200, height: 120 },
    data: { label: id, anchors: resolveAnchors(undefined) },
  }
}

function part(id: string, x: number, y: number, w = 200, h = 120, parentId?: string): Node {
  return {
    id,
    type: 'part',
    position: { x, y },
    ...(parentId ? { parentId } : {}),
    style: { width: w, height: h },
    data: { label: id, relationHandles: [] },
  }
}

function nodesFixture(): Node[] {
  return [
    req('R1', 0, 0),
    req('R2', 0, 300),
    part('Box', 400, 0),
    part('Outer', 600, 400, 400, 300),
    part('Inner', 20, 20, 100, 60, 'Outer'),
  ]
}

function edgesFixture(): Edge[] {
  return [
    {
      // R2 used to sit to the right of R1; it is now below it.
      id: 'ref1',
      source: 'R2',
      target: 'R1',
      sourceHandle: 'a-left',
      targetHandle: 'target:a-right',
      type: 'sysml',
      data: {
        relationKind: 'dependency',
        routing: 'angular',
        waypoints: [{ x: 300, y: 200 }],
        sourceSide: 'left',
        targetSide: 'right',
        sourceAnchorId: 'a-left',
        targetAnchorId: 'a-right',
      },
    },
    {
      id: 'sat1',
      source: 'Box',
      target: 'R1',
      sourceHandle: 'rel-src-sat1',
      targetHandle: 'target:a-top',
      type: 'sysml',
      data: {
        relationKind: 'satisfy',
        routing: 'direct',
        waypoints: [],
        sourceSide: 'top',
        targetSide: 'top',
        sourceOffset: 0.5,
        targetOffset: 0.5,
      },
    },
    {
      id: 'conn1',
      source: 'Box',
      target: 'Outer',
      sourceHandle: 'Box::p',
      targetHandle: 'target:Outer::q',
      type: 'sysml',
      data: { relationKind: 'connection', routing: 'angular', waypoints: [{ x: 1, y: 1 }] },
    },
    {
      id: 'dep2',
      source: 'Inner',
      target: 'R2',
      sourceHandle: 'rel-src-dep2',
      targetHandle: 'target:a-top',
      type: 'sysml',
      data: { relationKind: 'dependency', routing: 'direct', waypoints: [] },
    },
  ]
}

const edgeById = (edges: Edge[], id: string) => edges.find((e) => e.id === id) as Edge
const nodeById = (nodes: Node[], id: string) => nodes.find((n) => n.id === id) as Node
const dataOf = (e: Edge) =>
  (e.data || {}) as {
    sourceSide?: string
    targetSide?: string
    sourceOffset?: number
    targetOffset?: number
    waypoints?: unknown[]
    routing?: string
    sourceAnchorId?: string
    targetAnchorId?: string
  }

describe('redrawStructureRelations', () => {
  it('attaches a relation between two requirements to their facing sides', () => {
    const { edges } = redrawStructureRelations(nodesFixture(), edgesFixture())
    const ref = edgeById(edges, 'ref1')
    expect(dataOf(ref).sourceSide).toBe('top')
    expect(dataOf(ref).targetSide).toBe('bottom')
    expect(dataOf(ref).sourceOffset).toBeCloseTo(0.5)
    expect(dataOf(ref).targetOffset).toBeCloseTo(0.5)
  })

  it('follows the centre line for the offset', () => {
    const nodes = nodesFixture().map((n) =>
      n.id === 'R2' ? { ...n, position: { x: 100, y: 300 } } : n,
    )
    const { edges } = redrawStructureRelations(nodes, edgesFixture())
    const d = dataOf(edgeById(edges, 'ref1'))
    // R2 centre (200,360), R1 centre (100,60): leaves R2's top left of middle.
    expect(d.sourceSide).toBe('top')
    expect(d.sourceOffset).toBeLessThan(0.5)
    expect(d.targetSide).toBe('bottom')
    expect(d.targetOffset).toBeGreaterThan(0.5)
  })

  it('gives a part end its own rel- handle on the facing side', () => {
    const { nodes, edges } = redrawStructureRelations(nodesFixture(), edgesFixture())
    const sat = edgeById(edges, 'sat1')
    expect(sat.sourceHandle).toBe('rel-src-sat1')
    expect(dataOf(sat).sourceSide).toBe('left')
    expect(dataOf(sat).targetSide).toBe('right')
    const handles = (nodeById(nodes, 'Box').data as { relationHandles: RelHandle[] })
      .relationHandles
    expect(handles).toContainEqual(
      expect.objectContaining({ id: 'rel-src-sat1', type: 'source', side: 'left' }),
    )
  })

  it('adds a dedicated anchor on requirements and keeps the defaults', () => {
    const { nodes, edges, nodePatch } = redrawStructureRelations(
      nodesFixture(),
      edgesFixture(),
    )
    const ref = edgeById(edges, 'ref1')
    expect(ref.sourceHandle).toBe('rel:ref1')
    expect(ref.targetHandle).toBe('target:rel:ref1')
    expect(dataOf(ref).sourceAnchorId).toBe('rel:ref1')
    expect(dataOf(ref).targetAnchorId).toBe('rel:ref1')
    const r1 = (nodeById(nodes, 'R1').data as { anchors: BoundaryAnchor[] }).anchors
    const ids = r1.map((a) => a.id)
    expect(ids).toEqual(
      expect.arrayContaining(['a-left', 'a-right', 'a-top', 'a-bottom', 'rel:ref1', 'rel:sat1']),
    )
    expect(r1.find((a) => a.id === 'rel:ref1')).toMatchObject({ side: 'bottom' })
    expect(nodePatch.R1?.anchors?.map((a) => a.id)).toEqual(expect.arrayContaining(ids))
  })

  it('leaves port connections alone', () => {
    const before = edgesFixture()
    const { edges, edgePatch } = redrawStructureRelations(nodesFixture(), before)
    expect(edgeById(edges, 'conn1')).toBe(edgeById(before, 'conn1'))
    expect(edgePatch.conn1).toBeUndefined()
  })

  it('keeps every node in place and clears waypoints', () => {
    const before = nodesFixture()
    const { nodes, edges, edgePatch } = redrawStructureRelations(before, edgesFixture())
    for (const n of before) {
      expect(nodeById(nodes, n.id).position).toEqual(n.position)
    }
    const ref = edgeById(edges, 'ref1')
    expect(dataOf(ref).waypoints).toEqual([])
    expect(dataOf(ref).routing).toBe('direct')
    expect(edgePatch.ref1).toMatchObject({ routing: 'direct', waypoints: [] })
  })

  it('measures nested parts in absolute coordinates', () => {
    const { edges } = redrawStructureRelations(nodesFixture(), edgesFixture())
    // Inner sits at (620,420) on screen: R2 is to its left, not below it.
    expect(dataOf(edgeById(edges, 'dep2')).sourceSide).toBe('left')
    expect(dataOf(edgeById(edges, 'dep2')).targetSide).toBe('right')
  })

  it('redraws only the requested relation with onlyId', () => {
    const before = edgesFixture()
    const { edges, edgePatch } = redrawStructureRelations(nodesFixture(), before, {
      onlyId: 'sat1',
    })
    expect(Object.keys(edgePatch)).toEqual(['sat1'])
    expect(edgeById(edges, 'ref1')).toBe(edgeById(before, 'ref1'))
    expect(dataOf(edgeById(edges, 'sat1')).sourceSide).toBe('left')
  })

  it('returns an empty patch for an unknown onlyId', () => {
    const nodes = nodesFixture()
    const edges = edgesFixture()
    const out = redrawStructureRelations(nodes, edges, { onlyId: 'nope' })
    expect(out.edges).toBe(edges)
    expect(out.nodes).toBe(nodes)
    expect(out.edgePatch).toEqual({})
    expect(out.nodePatch).toEqual({})
  })

  it('tells whether a diagram has relations to redraw', () => {
    expect(hasRedrawableRelations(edgesFixture())).toBe(true)
    expect(hasRedrawableRelations([edgeById(edgesFixture(), 'conn1')])).toBe(false)
  })
})

describe('applyRelationHandlesToNodes', () => {
  it('adds the part handle when only the target end is a part', () => {
    const nodes = [req('R1', 0, 0), part('Box', 400, 0)]
    const edges: Edge[] = [
      {
        id: 'd1',
        source: 'R1',
        target: 'Box',
        sourceHandle: 'rel:d1',
        targetHandle: 'rel-tgt-d1',
        data: { relationKind: 'dependency', sourceSide: 'right', targetSide: 'left' },
      },
    ]
    const out = applyRelationHandlesToNodes(nodes, edges)
    const handles = (nodeById(out, 'Box').data as { relationHandles: RelHandle[] })
      .relationHandles
    expect(handles).toEqual([
      expect.objectContaining({ id: 'rel-tgt-d1', type: 'target', side: 'left' }),
    ])
  })
})

function viewFixture(): ViewPayload {
  const el = (
    id: string,
    kind: string,
    extra: Partial<ViewPayload['semantic'][string]> = {},
  ) => ({
    id,
    kind,
    name: id.split('::').pop() as string,
    parentId: 'P',
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  })
  return {
    view: {
      id: 'P::V',
      name: 'Reqs',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    semantic: {
      P: {
        ...el('P', 'package'),
        parentId: null,
        children: ['P::R1', 'P::R2', 'P::Box', 'P::ref1', 'P::sat1'],
      },
      'P::R1': el('P::R1', 'requirement'),
      'P::R2': el('P::R2', 'requirement'),
      'P::Box': el('P::Box', 'part'),
      'P::ref1': el('P::ref1', 'dependency', {
        sourceId: 'P::R2',
        targetId: 'P::R1',
        metadataKeywords: ['refine'],
      }),
      'P::sat1': el('P::sat1', 'satisfy', { sourceId: 'P::Box', targetId: 'P::R1' }),
    } as ViewPayload['semantic'],
    visualization: {
      nodes: {
        'P::R1': { artifactId: 'P::R1', x: 0, y: 0, width: 200, height: 120 },
        'P::R2': { artifactId: 'P::R2', x: 0, y: 300, width: 200, height: 120 },
        'P::Box': { artifactId: 'P::Box', x: 400, y: 0, width: 200, height: 120 },
      },
      edges: {},
    },
    subdiagrams: [],
    menus: {},
  } as unknown as ViewPayload
}

function build(view: ViewPayload) {
  return buildStructureGraph({
    view,
    onOpenView: () => {},
    onPortMoved: () => {},
    portMoveMode: false,
    showAttributes: false,
    viewMode: 'light',
    onWaypointsChange: () => {},
    onLabelOffsetChange: () => {},
  })
}

describe('redrawStructureRelations round trip', () => {
  it('reopens with the same attachment after the patches are saved', () => {
    const view = viewFixture()
    const built = build(view)
    const redrawn = redrawStructureRelations(built.nodes, built.edges)
    expect(Object.keys(redrawn.edgePatch).sort()).toEqual(['P::ref1', 'P::sat1'])

    const saved = viewFixture()
    for (const [id, patch] of Object.entries(redrawn.nodePatch)) {
      saved.visualization.nodes[id] = {
        ...saved.visualization.nodes[id],
        ...patch,
      } as VisualizationNode
    }
    for (const [id, patch] of Object.entries(redrawn.edgePatch)) {
      saved.visualization.edges[id] = { ...patch } as VisualizationEdge
    }
    const reopened = build(saved)
    for (const id of ['P::ref1', 'P::sat1']) {
      const a = edgeById(redrawn.edges, id)
      const b = edgeById(reopened.edges, id)
      expect(b.sourceHandle).toBe(a.sourceHandle)
      expect(b.targetHandle).toBe(a.targetHandle)
      expect(dataOf(b).sourceSide).toBe(dataOf(a).sourceSide)
      expect(dataOf(b).targetSide).toBe(dataOf(a).targetSide)
      expect(dataOf(b).sourceOffset).toBeCloseTo(dataOf(a).sourceOffset as number)
      expect(dataOf(b).targetOffset).toBeCloseTo(dataOf(a).targetOffset as number)
    }
    expect(dataOf(edgeById(redrawn.edges, 'P::ref1')).sourceSide).toBe('top')
  })
})
