import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  boundaryFlowBounds,
  findNodeIdForPort,
  pathCrossesObstaclesMid,
  polylineHitsRect,
  redrawStructureConnections,
  resolveObstacleAwareWaypoints,
  routeOrthogonal,
  syncInternalEdgeBounds,
  type Rect,
} from './connectionRouting'
import { resolveRoutePoints, type Pt } from '../edgeRouting'

describe('pathCrossesObstaclesMid', () => {
  const box: Rect = { minX: 40, minY: 20, maxX: 80, maxY: 80 }

  it('detects a 3-point L-route that cuts through a part', () => {
    // Previously required path.length >= 4 and skipped all segments on short paths.
    const path = [
      { x: 10, y: 50 },
      { x: 110, y: 50 },
      { x: 110, y: 90 },
    ]
    expect(pathCrossesObstaclesMid(path, [box])).toBe(true)
  })

  it('ignores a short port stub into an endpoint pad', () => {
    // Leave the left side of the box with a short stub, then travel clear of it.
    const path = [
      { x: 40, y: 50 },
      { x: 28, y: 50 },
      { x: 28, y: 10 },
      { x: 120, y: 10 },
    ]
    expect(pathCrossesObstaclesMid(path, [box])).toBe(false)
  })
})

describe('resolveObstacleAwareWaypoints', () => {
  const iaac: Rect = { minX: 40, minY: 40, maxX: 100, maxY: 100 }
  const bounds: Rect = { minX: 0, minY: 0, maxX: 160, maxY: 160 }

  it('replaces stale vertical waypoints that cut through a part', () => {
    const stale = [
      { x: 70, y: 20 },
      { x: 70, y: 140 },
    ]
    const fixed = resolveObstacleAwareWaypoints(
      20,
      20,
      20,
      140,
      stale,
      [iaac],
      bounds,
    )
    const path = resolveRoutePoints(20, 20, 20, 140, fixed)
    expect(polylineHitsRect(path, iaac)).toBe(false)
    expect(pathCrossesObstaclesMid(path, [iaac])).toBe(false)
  })

  it('keeps clear waypoints unchanged', () => {
    const clear = [
      { x: 20, y: 20 },
      { x: 20, y: 140 },
    ]
    const fixed = resolveObstacleAwareWaypoints(
      20,
      20,
      20,
      140,
      clear,
      [iaac],
      bounds,
    )
    expect(fixed).toEqual(clear)
  })
})


function isOrtho(pts: { x: number; y: number }[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

describe('routeOrthogonal', () => {
  it('uses a simple L when the corridor is empty', () => {
    const path = routeOrthogonal(
      { x: 0, y: 10 },
      { x: 100, y: 80 },
      [],
      { minX: -10, minY: -10, maxX: 120, maxY: 100 },
    )
    expect(path[0]).toEqual({ x: 0, y: 10 })
    expect(path[path.length - 1]).toEqual({ x: 100, y: 80 })
    expect(isOrtho(path)).toBe(true)
    expect(path.length).toBeLessThanOrEqual(4)
  })

  it('goes around a part instead of through it', () => {
    const box: Rect = { minX: 40, minY: 20, maxX: 80, maxY: 80 }
    const path = routeOrthogonal(
      { x: 10, y: 50 },
      { x: 110, y: 50 },
      [box],
      { minX: 0, minY: 0, maxX: 120, maxY: 100 },
    )
    expect(isOrtho(path)).toBe(true)
    expect(polylineHitsRect(path, box)).toBe(false)
    expect(path[0]).toEqual({ x: 10, y: 50 })
    expect(path[path.length - 1]).toEqual({ x: 110, y: 50 })
  })

  it('never falls back to a path that cuts through an obstacle', () => {
    // Wide blocker filling almost the whole corridor — L-paths would cut through.
    const wall: Rect = { minX: 30, minY: 0, maxX: 70, maxY: 100 }
    const path = routeOrthogonal(
      { x: 10, y: 50 },
      { x: 90, y: 50 },
      [wall],
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    )
    expect(isOrtho(path)).toBe(true)
    expect(polylineHitsRect(path, wall)).toBe(false)
  })
})

function partNode(opts: {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId?: string
  isBoundary?: boolean
  ports?: PartNodeData['ports']
}): Node {
  return {
    id: opts.id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x, y: opts.y },
    width: opts.w,
    height: opts.h,
    style: { width: opts.w, height: opts.h },
    data: {
      label: opts.id,
      artifactId: opts.id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('redrawStructureConnections', () => {
  it('keeps current part positions and routes around sibling parts', () => {
    const parent = partNode({
      id: 'HBox',
      x: 0,
      y: 0,
      w: 420,
      h: 260,
      isBoundary: true,
      ports: [{ id: 'HBox::event', name: 'event', side: 'left', offset: 0.5 }],
    })
    const boxA = partNode({
      id: 'BoxA',
      x: 20,
      y: 60,
      w: 120,
      h: 100,
      parentId: 'HBox',
      ports: [{ id: 'BoxA::event', name: 'event', side: 'right', offset: 0.5 }],
    })
    const broker = partNode({
      id: 'Broker',
      x: 260,
      y: 60,
      w: 120,
      h: 100,
      parentId: 'HBox',
      ports: [{ id: 'Broker::event', name: 'event', side: 'left', offset: 0.5 }],
    })
    const blocker = partNode({
      id: 'Blocker',
      x: 160,
      y: 40,
      w: 80,
      h: 140,
      parentId: 'HBox',
    })

    const edges: Edge[] = [
      {
        id: 'conn',
        source: 'BoxA',
        target: 'Broker',
        sourceHandle: 'BoxA::event',
        targetHandle: 'target:Broker::event',
        data: { routing: 'angular', waypoints: [{ x: 200, y: 111 }] },
      },
    ]

    const routed = redrawStructureConnections(
      [parent, boxA, broker, blocker],
      edges,
    )
    expect(routed).toHaveLength(1)
    const wps = routed[0].waypoints
    const start = { x: 20 + 120, y: 60 + 100 * 0.5 }
    const end = { x: 260, y: 60 + 100 * 0.5 }
    const path = [start, ...wps, end]
    expect(isOrtho(path)).toBe(true)
    expect(
      polylineHitsRect(path, { minX: 160, minY: 40, maxX: 240, maxY: 180 }),
    ).toBe(false)
  })

  it('keeps locked waypoints fixed when redrawing', () => {
    const parent = partNode({
      id: 'Root',
      x: 0,
      y: 0,
      w: 500,
      h: 300,
      isBoundary: true,
    })
    const a = partNode({
      id: 'A',
      parentId: 'Root',
      x: 40,
      y: 80,
      w: 100,
      h: 80,
      ports: [{ id: 'A::o', name: 'o', side: 'right', offset: 0.5 }],
    })
    const b = partNode({
      id: 'B',
      parentId: 'Root',
      x: 320,
      y: 80,
      w: 100,
      h: 80,
      ports: [{ id: 'B::i', name: 'i', side: 'left', offset: 0.5 }],
    })
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'A',
        target: 'B',
        sourceHandle: 'A::o',
        targetHandle: 'target:B::i',
      },
    ]
    const locked = { x: 200, y: 40, locked: true as const }
    const routed = redrawStructureConnections([parent, a, b], edges, undefined, [
      { id: 'c1', waypoints: [locked, { x: 250, y: 90 }] },
    ])
    expect(routed[0].waypoints.some((w) => w.locked && w.x === 200 && w.y === 40)).toBe(
      true,
    )
    // Unlocked stale corner must not be kept as-is unless recreated by router
    expect(
      routed[0].waypoints.some((w) => !w.locked && w.x === 250 && w.y === 90),
    ).toBe(false)
  })

  it('discards all unlocked waypoints on redraw', () => {
    const parent = partNode({
      id: 'Root',
      x: 0,
      y: 0,
      w: 500,
      h: 300,
      isBoundary: true,
    })
    const a = partNode({
      id: 'A',
      parentId: 'Root',
      x: 40,
      y: 80,
      w: 100,
      h: 80,
      ports: [{ id: 'A::o', name: 'o', side: 'left', offset: 0.5 }],
    })
    const b = partNode({
      id: 'B',
      parentId: 'Root',
      x: 320,
      y: 80,
      w: 100,
      h: 80,
      ports: [{ id: 'B::i', name: 'i', side: 'right', offset: 0.5 }],
    })
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'A',
        target: 'B',
        sourceHandle: 'A::o',
        targetHandle: 'target:B::i',
      },
    ]
    // Old right-side ghost corners
    const routed = redrawStructureConnections([parent, a, b], edges, undefined, [
      {
        id: 'c1',
        waypoints: [
          { x: 140, y: 120 },
          { x: 140, y: 200 },
          { x: 320, y: 200 },
        ],
      },
    ])
    expect(
      routed[0].waypoints.every(
        (w) => !(w.x === 140 && w.y === 120) && !(w.x === 140 && w.y === 200),
      ),
    ).toBe(true)
  })

  it('routes parent–child on the same side without crossing the child', () => {
    const parent = partNode({
      id: 'HBox',
      x: 60,
      y: 40,
      w: 400,
      h: 240,
      isBoundary: true,
      ports: [{ id: 'HBox::event', name: 'event', side: 'left', offset: 0.4 }],
    })
    const broker = partNode({
      id: 'Broker',
      x: 40,
      y: 50,
      w: 160,
      h: 100,
      parentId: 'HBox',
      ports: [{ id: 'Broker::event', name: 'event', side: 'left', offset: 0.4 }],
    })
    const other = partNode({
      id: 'Other',
      x: 220,
      y: 50,
      w: 140,
      h: 100,
      parentId: 'HBox',
    })

    const routed = redrawStructureConnections(
      [parent, broker, other],
      [
        {
          id: 'deleg',
          source: 'Broker',
          target: 'HBox',
          sourceHandle: 'Broker::event',
          targetHandle: 'target:HBox::event',
          data: { routing: 'angular', waypoints: [] },
        },
      ],
    )

    const start = { x: 60 + 40, y: 40 + 50 + 100 * 0.4 }
    const end = { x: 60, y: 40 + 240 * 0.4 }
    const path = [start, ...routed[0].waypoints, end]
    expect(isOrtho(path)).toBe(true)
    expect(
      polylineHitsRect(path, {
        minX: 60 + 40,
        minY: 40 + 50,
        maxX: 60 + 40 + 160,
        maxY: 40 + 50 + 100,
      }),
    ).toBe(false)
    expect(
      polylineHitsRect(path, {
        minX: 60 + 220,
        minY: 40 + 50,
        maxX: 60 + 220 + 140,
        maxY: 40 + 50 + 100,
      }),
    ).toBe(false)
  })

  it('prefers live node port side over stale visualization layout', () => {
    const parent = partNode({
      id: 'HBox',
      x: 0,
      y: 0,
      w: 300,
      h: 200,
      isBoundary: true,
      ports: [{ id: 'HBox::p', name: 'p', side: 'left', offset: 0.5 }],
    })
    const child = partNode({
      id: 'Child',
      x: 40,
      y: 40,
      w: 100,
      h: 80,
      parentId: 'HBox',
      // Live placement is left (as rendered); viz still has outdated right.
      ports: [{ id: 'Child::p', name: 'p', side: 'left', offset: 0.5 }],
    })
    const routed = redrawStructureConnections(
      [parent, child],
      [
        {
          id: 'c',
          source: 'Child',
          target: 'HBox',
          sourceHandle: 'Child::p',
          targetHandle: 'target:HBox::p',
          data: { routing: 'angular', waypoints: [] },
        },
      ],
      {
        'Child::p': { side: 'right', offset: 0.5 },
        'HBox::p': { side: 'right', offset: 0.5 },
      },
    )
    // Live left → left: start at child left edge
    const start = { x: 40, y: 40 + 40 }
    const end = { x: 0, y: 100 }
    const path = [start, ...routed[0].waypoints, end]
    expect(path[0].x).toBe(start.x)
    expect(path[path.length - 1].x).toBe(end.x)
    expect(
      polylineHitsRect(path, { minX: 40, minY: 40, maxX: 140, maxY: 120 }),
    ).toBe(false)
  })

  it('partial redraw uses context edges for separation and jumpers', () => {
    const parent = partNode({
      id: 'Root',
      x: 0,
      y: 0,
      w: 400,
      h: 300,
      isBoundary: true,
    })
    const a = partNode({
      id: 'A',
      x: 40,
      y: 40,
      w: 80,
      h: 60,
      parentId: 'Root',
      ports: [
        { id: 'A::out', name: 'out', side: 'right', offset: 0.5 },
        { id: 'A::in', name: 'in', side: 'left', offset: 0.5 },
      ],
    })
    const b = partNode({
      id: 'B',
      x: 260,
      y: 40,
      w: 80,
      h: 60,
      parentId: 'Root',
      ports: [
        { id: 'B::in', name: 'in', side: 'left', offset: 0.5 },
        { id: 'B::out', name: 'out', side: 'right', offset: 0.5 },
      ],
    })
    const edgeA: Edge = {
      id: 'e-a',
      source: 'A',
      target: 'B',
      sourceHandle: 'A::out',
      targetHandle: 'target:B::in',
      data: { routing: 'angular', waypoints: [] },
    }
    const edgeB: Edge = {
      id: 'e-b',
      source: 'B',
      target: 'A',
      sourceHandle: 'B::out',
      targetHandle: 'target:A::in',
      data: {
        routing: 'angular',
        waypoints: [
          { x: 300, y: 70 },
          { x: 300, y: 200 },
          { x: 20, y: 200 },
          { x: 20, y: 70 },
        ],
      },
    }
    const all = [edgeA, edgeB]
    const routed = redrawStructureConnections(
      [parent, a, b],
      [edgeA],
      undefined,
      all.map((e) => ({
        id: e.id,
        waypoints: (e.data as { waypoints?: Pt[] }).waypoints || [],
      })),
      { separation: 5, contextEdges: all },
    )
    expect(routed.length).toBe(2)
    const byId = new Map(routed.map((r) => [r.id, r]))
    expect(byId.has('e-a')).toBe(true)
    expect(byId.has('e-b')).toBe(true)
  })

  it('reroutes when a port moves to another side of its part', () => {
    const a = partNode({
      id: 'A',
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      ports: [{ id: 'A::p', name: 'p', side: 'right', offset: 0.5 }],
    })
    const b = partNode({
      id: 'B',
      x: 200,
      y: 0,
      w: 100,
      h: 80,
      ports: [{ id: 'B::p', name: 'p', side: 'left', offset: 0.5 }],
    })
    const edge: Edge = {
      id: 'c',
      source: 'A',
      target: 'B',
      sourceHandle: 'A::p',
      targetHandle: 'target:B::p',
      data: { routing: 'angular', waypoints: [] },
    }
    const movedA: Node = {
      ...a,
      data: {
        ...(a.data as PartNodeData),
        ports: [{ id: 'A::p', name: 'p', side: 'bottom', offset: 0.5 }],
      },
    }
    const before = redrawStructureConnections([a, b], [edge])
    const after = redrawStructureConnections([movedA, b], [edge])
    expect(before[0].waypoints).not.toEqual(after[0].waypoints)
    const start = { x: 50, y: 80 }
    const end = { x: 200, y: 40 }
    const path = [start, ...after[0].waypoints, end]
    expect(path[0]).toEqual(start)
    expect(path[path.length - 1]).toEqual(end)
  })
})

describe('boundaryFlowBounds / syncInternalEdgeBounds', () => {
  it('tracks boundary resize for internal edge clamping', () => {
    const boundary = partNode({
      id: 'Root',
      x: 10,
      y: 20,
      w: 300,
      h: 200,
      isBoundary: true,
    })
    const resized: Node = {
      ...boundary,
      style: { width: 500, height: 360 },
      width: 500,
      height: 360,
    }
    expect(boundaryFlowBounds([boundary])).toEqual({
      minX: 10,
      minY: 20,
      maxX: 310,
      maxY: 220,
    })
    expect(boundaryFlowBounds([resized])).toEqual({
      minX: 10,
      minY: 20,
      maxX: 510,
      maxY: 380,
    })

    const edge: Edge = {
      id: 'e1',
      source: 'A',
      target: 'B',
      data: {
        internal: true,
        parentBounds: { minX: 10, minY: 20, maxX: 310, maxY: 220 },
      },
    }
    const synced = syncInternalEdgeBounds([resized], [edge])
    expect((synced[0].data as { parentBounds?: Rect }).parentBounds).toEqual({
      minX: 10,
      minY: 20,
      maxX: 510,
      maxY: 380,
    })
  })

  it('finds the owning part for a port id', () => {
    const node = partNode({
      id: 'Part',
      x: 0,
      y: 0,
      w: 120,
      h: 80,
      ports: [{ id: 'Part::p1', name: 'p1', side: 'left', offset: 0.3 }],
    })
    expect(findNodeIdForPort([node], 'Part::p1')).toBe('Part')
    expect(findNodeIdForPort([node], 'missing')).toBeNull()
  })
})
