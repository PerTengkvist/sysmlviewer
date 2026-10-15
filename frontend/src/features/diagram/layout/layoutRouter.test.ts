import { describe, expect, it, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { planStructureRoutes } from './layoutRouter'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    isBoundary?: boolean
    parentId?: string
    ports?: PartNodeData['ports']
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    width: opts.w ?? 160,
    height: opts.h ?? 100,
    style: { width: opts.w ?? 160, height: opts.h ?? 100 },
    data: {
      label: id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('planStructureRoutes', () => {
  it('dispatches full mode to the ELK path', async () => {
    const elk = vi.fn(async () => ({
      nodes: { a: { artifactId: 'a', x: 1, y: 2, width: 100, height: 80 } },
      edges: {
        c1: { artifactId: 'c1', routing: 'angular' as const, waypoints: [] },
      },
      routes: [{ id: 'c1', waypoints: [], jumps: [] }],
    }))
    const own = vi.fn(() => [{ id: 'c1', waypoints: [{ x: 9, y: 9 }] }])

    const nodes = [
      part('root', { isBoundary: true, w: 400, h: 300 }),
      part('a', {
        parentId: 'root',
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        parentId: 'root',
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: { routing: 'angular', waypoints: [] },
      },
    ]

    const result = await planStructureRoutes({
      mode: 'full',
      layoutNodes: true,
      nodes,
      edges,
      deps: { runElk: elk, runOwn: own },
    })
    expect(elk).toHaveBeenCalled()
    expect(own).not.toHaveBeenCalled()
    expect(result.routes[0]?.id).toBe('c1')
  })

  it('dispatches single mode to the own router and keeps locked vias', async () => {
    const elk = vi.fn(async () => ({
      nodes: {},
      edges: {},
      routes: [],
    }))
    const own = vi.fn(() => [
      {
        id: 'c1',
        waypoints: [
          { x: 50, y: 50, locked: true },
          { x: 80, y: 50 },
        ],
      },
    ])

    const nodes = [
      part('a', {
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        x: 200,
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: {
          routing: 'angular',
          waypoints: [{ x: 50, y: 50, locked: true }],
        },
      },
    ]

    const result = await planStructureRoutes({
      mode: 'single',
      edgeId: 'c1',
      nodes,
      edges,
      existingRoutes: [
        { id: 'c1', waypoints: [{ x: 50, y: 50, locked: true }] },
      ],
      deps: { runElk: elk, runOwn: own },
    })
    expect(own).toHaveBeenCalled()
    expect(elk).not.toHaveBeenCalled()
    expect(result.routes[0]?.waypoints.some((w) => w.locked)).toBe(true)
  })

  it('falls back to own router for full mode when any angular edge has a locked via', async () => {
    const elk = vi.fn(async () => ({
      nodes: {},
      edges: {},
      routes: [],
    }))
    const own = vi.fn(() => [
      {
        id: 'c1',
        waypoints: [{ x: 10, y: 10, locked: true }],
      },
    ])

    const nodes = [
      part('a', {
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        x: 200,
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: {
          routing: 'angular',
          waypoints: [{ x: 10, y: 10, locked: true }],
        },
      },
    ]

    await planStructureRoutes({
      mode: 'full',
      layoutNodes: false,
      nodes,
      edges,
      existingRoutes: [
        { id: 'c1', waypoints: [{ x: 10, y: 10, locked: true }] },
      ],
      deps: { runElk: elk, runOwn: own },
    })
    expect(own).toHaveBeenCalled()
    expect(elk).not.toHaveBeenCalled()
  })
})
