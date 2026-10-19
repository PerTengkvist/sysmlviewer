import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { pathCrossesObstaclesMid, type Rect } from './connectionRouting'
import {
  layoutStructureWithElk,
  waypointsFromElkEdge,
  type ElkEdgeLike,
} from './elkStructureLayout'

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

describe('waypointsFromElkEdge', () => {
  it('returns orthogonal corner waypoints without endpoints', () => {
    const edge: ElkEdgeLike = {
      id: 'c1',
      sections: [
        {
          id: 's0',
          startPoint: { x: 10, y: 10 },
          endPoint: { x: 10, y: 50 },
          bendPoints: [
            { x: 10, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 50 },
          ],
        },
      ],
    }
    const wps = waypointsFromElkEdge(edge)
    expect(wps).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 50 },
    ])
    // Orthogonal steps
    for (let i = 1; i < wps.length; i++) {
      const a = wps[i - 1]
      const b = wps[i]
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
  })
})

describe('layoutStructureWithElk edges', () => {
  it('returns angular edge waypoints when includeEdges is true', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 500, h: 300 }),
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
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: true,
      layoutNodes: true,
    })
    expect(result.edges?.['c1']?.routing).toBe('angular')
    expect(Array.isArray(result.edges?.['c1']?.waypoints)).toBe(true)
    const locked = (result.edges?.['c1']?.waypoints || []).some((w) => w.locked)
    expect(locked).toBe(false)
  })

  it('preserves node positions when layoutNodes is false', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 500, h: 400, x: 0, y: 0 }),
      part('a', {
        parentId: 'root',
        x: 40,
        y: 40,
        w: 100,
        h: 80,
        ports: [{ id: 'a::out', name: 'out', side: 'bottom', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'root',
        x: 40,
        y: 280,
        w: 100,
        h: 80,
        ports: [{ id: 'b::in', name: 'in', side: 'top', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: true,
      layoutNodes: false,
    })
    expect(result.nodes['a']?.x).toBeCloseTo(40, 0)
    expect(result.nodes['a']?.y).toBeCloseTo(40, 0)
    expect(result.nodes['b']?.x).toBeCloseTo(40, 0)
    expect(result.nodes['b']?.y).toBeCloseTo(280, 0)
    expect(result.edges?.['c1']).toBeTruthy()
  })

  it('routes around a sibling part on a simple 3-part case', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 400, h: 420 }),
      part('a', {
        parentId: 'root',
        x: 40,
        y: 40,
        w: 100,
        h: 80,
        ports: [{ id: 'a::out', name: 'out', side: 'bottom', offset: 0.5 }],
      }),
      part('blocker', {
        parentId: 'root',
        x: 30,
        y: 160,
        w: 120,
        h: 80,
        ports: [{ id: 'blocker::p', name: 'p', side: 'right', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'root',
        x: 40,
        y: 300,
        w: 100,
        h: 80,
        ports: [{ id: 'b::in', name: 'in', side: 'top', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: true,
      layoutNodes: false,
    })
    const wps = result.edges?.['c1']?.waypoints || []
    // Use laid-out port sides/offsets for endpoints.
    const aPos = { x: result.nodes['a']!.x!, y: result.nodes['a']!.y! }
    const bPos = { x: result.nodes['b']!.x!, y: result.nodes['b']!.y! }
    const aSz = {
      width: result.nodes['a']!.width!,
      height: result.nodes['a']!.height!,
    }
    const bSz = {
      width: result.nodes['b']!.width!,
      height: result.nodes['b']!.height!,
    }
    const aSide = result.nodes['a::out']!.side as 'left' | 'right' | 'top' | 'bottom'
    const bSide = result.nodes['b::in']!.side as 'left' | 'right' | 'top' | 'bottom'
    const aOff = result.nodes['a::out']!.offset ?? 0.5
    const bOff = result.nodes['b::in']!.offset ?? 0.5
    const portPt = (
      pos: { x: number; y: number },
      sz: { width: number; height: number },
      side: typeof aSide,
      offset: number,
    ) => {
      const o = offset
      if (side === 'left') return { x: pos.x, y: pos.y + sz.height * o }
      if (side === 'right') return { x: pos.x + sz.width, y: pos.y + sz.height * o }
      if (side === 'top') return { x: pos.x + sz.width * o, y: pos.y }
      return { x: pos.x + sz.width * o, y: pos.y + sz.height }
    }
    const start = portPt(aPos, aSz, aSide, aOff)
    const end = portPt(bPos, bSz, bSide, bOff)
    const full = [start, ...wps.map((w) => ({ x: w.x, y: w.y })), end]
    const blocker: Rect = {
      minX: result.nodes['blocker']!.x!,
      minY: result.nodes['blocker']!.y!,
      maxX: result.nodes['blocker']!.x! + result.nodes['blocker']!.width!,
      maxY: result.nodes['blocker']!.y! + result.nodes['blocker']!.height!,
    }
    expect(aSide).toBe('bottom')
    expect(bSide).toBe('top')
    expect(pathCrossesObstaclesMid(full, [blocker])).toBe(false)
  })
})
