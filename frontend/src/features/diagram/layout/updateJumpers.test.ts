import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { computeJumpers, type RoutedPoly } from './connectionSeparation'
import { buildJumperPolys } from './updateJumpers'

describe('computeJumpers z-order', () => {
  const crossing = (za: number, zb: number): RoutedPoly[] => [
    {
      id: 'z-low-id-zzz',
      sourcePort: 'p1',
      targetPort: 'p2',
      z: za,
      points: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    },
    {
      id: 'a-high-id-aaa',
      sourcePort: 'p3',
      targetPort: 'p4',
      z: zb,
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    },
  ]

  it('puts the jumper on the higher-z wire regardless of id', () => {
    const jumps = computeJumpers(crossing(10, 0))
    expect(jumps.get('z-low-id-zzz')?.some((j) => j.x === 50 && j.y === 50)).toBe(
      true,
    )
    expect(jumps.has('a-high-id-aaa')).toBe(false)
  })

  it('falls back to id when z is equal', () => {
    const jumps = computeJumpers(crossing(0, 0))
    // max id = z-low-id-zzz
    expect(jumps.has('z-low-id-zzz')).toBe(true)
    expect(jumps.has('a-high-id-aaa')).toBe(false)
  })
})

describe('buildJumperPolys', () => {
  it('includes edges with zero waypoints using full port-to-port routes', () => {
    const nodes: Node[] = [
      {
        id: 'A',
        position: { x: 0, y: 0 },
        data: {
          ports: [{ id: 'A::p', name: 'p', side: 'right', offset: 0.5 }],
        },
        width: 100,
        height: 100,
        style: { width: 100, height: 100 },
      },
      {
        id: 'B',
        position: { x: 200, y: 0 },
        data: {
          ports: [{ id: 'B::p', name: 'p', side: 'left', offset: 0.5 }],
        },
        width: 100,
        height: 100,
        style: { width: 100, height: 100 },
      },
    ]
    const edges: Edge[] = [
      {
        id: 'conn',
        source: 'A',
        target: 'B',
        sourceHandle: 'A::p',
        targetHandle: 'target:B::p',
        zIndex: 0,
        data: { routing: 'angular', waypoints: [] },
      },
    ]
    const polys = buildJumperPolys(nodes, edges)
    expect(polys).toHaveLength(1)
    expect(polys[0]!.points.length).toBeGreaterThanOrEqual(2)
    expect(polys[0]!.points[0]).toEqual({ x: 100, y: 50 })
    expect(polys[0]!.points[polys[0]!.points.length - 1]).toEqual({
      x: 200,
      y: 50,
    })
  })

  it('skips non-angular edges', () => {
    const nodes: Node[] = [
      {
        id: 'A',
        position: { x: 0, y: 0 },
        data: {
          ports: [{ id: 'A::p', name: 'p', side: 'right', offset: 0.5 }],
        },
        width: 100,
        height: 100,
      },
      {
        id: 'B',
        position: { x: 200, y: 0 },
        data: {
          ports: [{ id: 'B::p', name: 'p', side: 'left', offset: 0.5 }],
        },
        width: 100,
        height: 100,
      },
    ]
    const edges: Edge[] = [
      {
        id: 'direct',
        source: 'A',
        target: 'B',
        sourceHandle: 'A::p',
        targetHandle: 'target:B::p',
        data: { routing: 'direct', waypoints: [] },
      },
    ]
    expect(buildJumperPolys(nodes, edges)).toEqual([])
  })
})
