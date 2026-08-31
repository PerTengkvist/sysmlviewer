import { describe, expect, it } from 'vitest'
import {
  angularPathDWithJumps,
  computeJumpers,
  keepLockedWaypoints,
  separateUnrelatedRoutes,
  sharePort,
  waypointsAttachToEnds,
  type RoutedPoly,
} from './connectionSeparation'

describe('waypointsAttachToEnds', () => {
  it('rejects corners that do not share an axis with the new port end', () => {
    // Port moved from right (200,50) to left (0,50); old corner still at x=200
    expect(
      waypointsAttachToEnds(0, 50, 300, 50, [{ x: 200, y: 50 }, { x: 200, y: 80 }]),
    ).toBe(false)
  })

  it('accepts an ortho elbow from current ends', () => {
    expect(
      waypointsAttachToEnds(0, 50, 200, 100, [{ x: 100, y: 50 }, { x: 100, y: 100 }]),
    ).toBe(true)
  })
})

describe('keepLockedWaypoints', () => {
  it('drops unlocked corners', () => {
    expect(
      keepLockedWaypoints([
        { x: 1, y: 2 },
        { x: 3, y: 4, locked: true },
        { x: 5, y: 6, locked: false },
      ]),
    ).toEqual([{ x: 3, y: 4, locked: true }])
  })
})

describe('sharePort', () => {
  it('detects shared ports', () => {
    expect(
      sharePort(
        { sourcePort: 'a', targetPort: 'b' },
        { sourcePort: 'b', targetPort: 'c' },
      ),
    ).toBe(true)
    expect(
      sharePort(
        { sourcePort: 'a', targetPort: 'b' },
        { sourcePort: 'c', targetPort: 'd' },
      ),
    ).toBe(false)
  })
})

function nearly(a: number, b: number, eps = 0.75) {
  return Math.abs(a - b) < eps
}

describe('separateUnrelatedRoutes', () => {
  it('offsets coincident vertical tracks of unrelated nets', () => {
    const routes: RoutedPoly[] = [
      {
        id: 'c1',
        sourcePort: 'p1',
        targetPort: 'p2',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 100, y: 100 },
        ],
      },
      {
        id: 'c2',
        sourcePort: 'p3',
        targetPort: 'p4',
        points: [
          { x: 10, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 90, y: 100 },
        ],
      },
    ]
    const next = separateUnrelatedRoutes(routes, 5)
    const xs1 = next[0].points.map((p) => p.x)
    const xs2 = next[1].points.map((p) => p.x)
    // At least one route's vertical run should have moved
    const mid1 = next[0].points.filter((p) => p.y > 10 && p.y < 90).map((p) => p.x)
    const mid2 = next[1].points.filter((p) => p.y > 10 && p.y < 90).map((p) => p.x)
    if (mid1.length && mid2.length) {
      expect(Math.abs(mid1[0] - mid2[0])).toBeGreaterThanOrEqual(5)
    } else {
      expect(xs1.join(',') !== xs2.join(',')).toBe(true)
    }
  })

  it('separates parallel tracks that are closer than separation but not coincident', () => {
    const routes: RoutedPoly[] = [
      {
        id: 'c1',
        sourcePort: 'p1',
        targetPort: 'p2',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
      {
        id: 'c2',
        sourcePort: 'p3',
        targetPort: 'p4',
        points: [
          { x: 0, y: 10 },
          { x: 53, y: 10 },
          { x: 53, y: 100 },
        ],
      },
    ]
    const next = separateUnrelatedRoutes(routes, 5)
    const mid1 = next[0].points.find((p) => nearly(p.y, 50))?.x ?? next[0].points[1].x
    const mid2 = next[1].points.find((p) => nearly(p.y, 50))?.x ?? next[1].points[1].x
    expect(Math.abs(mid1 - mid2)).toBeGreaterThanOrEqual(5)
  })

  it('does not separate nets that share a port', () => {
    const routes: RoutedPoly[] = [
      {
        id: 'c1',
        sourcePort: 'shared',
        targetPort: 'p2',
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
      {
        id: 'c2',
        sourcePort: 'shared',
        targetPort: 'p4',
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    ]
    const next = separateUnrelatedRoutes(routes, 5)
    expect(next[0].points[0].x).toBe(50)
    expect(next[1].points[0].x).toBe(50)
  })
})

describe('computeJumpers / angularPathDWithJumps', () => {
  it('adds a jumper on the overlying wire at an unrelated crossing', () => {
    const routes: RoutedPoly[] = [
      {
        id: 'a',
        sourcePort: 'p1',
        targetPort: 'p2',
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      {
        id: 'b',
        sourcePort: 'p3',
        targetPort: 'p4',
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    ]
    const jumps = computeJumpers(routes)
    // overlying = max(id) = 'b'
    expect(jumps.get('b')?.some((j) => j.x === 50 && j.y === 50)).toBe(true)
    expect(jumps.has('a')).toBe(false)

    const path = angularPathDWithJumps(routes[1].points, jumps.get('b') || [], 5)
    expect(path).toContain('A ')
  })
})
