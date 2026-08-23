import { describe, expect, it } from 'vitest'
import {
  angularSegmentHandles,
  clampToFlowBounds,
  clampWaypointToParent,
  defaultInternalWaypoints,
  moveAngularSegment,
  moveWaypointInList,
  portLabelStyle,
  reattachWaypointsToEnds,
  resolveRoutePoints,
  translateFlowBounds,
  translatePoints,
  type FlowBounds,
} from './edgeRouting'

describe('portLabelStyle', () => {
  it('places left outside labels to the left of the port', () => {
    const s = portLabelStyle('left', 0.5, { outside: true })
    expect(s.right).toBe('100%')
    expect(s.transform).toBe('translateY(-50%)')
  })

  it('places right outside labels to the right of the port', () => {
    const s = portLabelStyle('right', 0.4, { outside: true })
    expect(s.left).toBe('100%')
    expect(s.top).toBe('40%')
  })

  it('places child left labels inside, centered on port', () => {
    const s = portLabelStyle('left', 0.5, { outside: false })
    expect(s.left).toBe(14)
    expect(s.top).toBe('50%')
    expect(s.transform).toBe('translateY(-50%)')
  })
})

describe('waypoints', () => {
  const bounds = { width: 400, height: 300 }

  it('clamps waypoints inside parent', () => {
    expect(clampWaypointToParent({ x: -10, y: 500 }, bounds)).toEqual({
      x: 12,
      y: 288,
    })
  })

  it('builds a default mid waypoint', () => {
    const wps = defaultInternalWaypoints(0, 0, 100, 100, bounds)
    expect(wps).toHaveLength(1)
    expect(wps[0].x).toBeGreaterThan(0)
  })

  it('moves a waypoint in the list', () => {
    const next = moveWaypointInList(
      [
        { x: 50, y: 50 },
        { x: 80, y: 80 },
      ],
      0,
      { x: 200, y: 100 },
      bounds,
    )
    expect(next[0]).toEqual({ x: 200, y: 100 })
    expect(next[1]).toEqual({ x: 80, y: 80 })
  })
})

describe('angular segment edit', () => {
  const flow: FlowBounds = { minX: 0, minY: 0, maxX: 400, maxY: 300 }

  it('clamps to absolute flow bounds', () => {
    expect(clampToFlowBounds({ x: -5, y: 999 }, flow)).toEqual({
      x: 10,
      y: 290,
    })
  })

  it('builds alternating H/V segments', () => {
    const pts = resolveRoutePoints(10, 20, 200, 180, [{ x: 100, y: 90 }])
    const segs = angularSegmentHandles(pts)
    expect(segs.some((s) => s.orient === 'h')).toBe(true)
    expect(segs.some((s) => s.orient === 'v')).toBe(true)
  })

  it('moves a vertical segment left/right', () => {
    const next = moveAngularSegment(
      10,
      20,
      200,
      180,
      [{ x: 100, y: 90 }],
      1, // V at x=100
      { x: 140, y: 50 },
      flow,
    )
    const pts = resolveRoutePoints(10, 20, 200, 180, next)
    const v = pts.find(
      (p, i) => i > 0 && i < pts.length - 1 && Math.abs(p.x - 140) < 1,
    )
    expect(v).toBeTruthy()
  })

  it('moves a horizontal segment up/down', () => {
    const pts0 = resolveRoutePoints(10, 20, 200, 180, [{ x: 100, y: 90 }])
    const hSeg = angularSegmentHandles(pts0).find((s) => s.orient === 'h' && s.index > 0)
    expect(hSeg).toBeTruthy()
    const next = moveAngularSegment(
      10,
      20,
      200,
      180,
      [{ x: 100, y: 90 }],
      hSeg!.index,
      { x: 50, y: 120 },
      flow,
    )
    const pts = resolveRoutePoints(10, 20, 200, 180, next)
    expect(pts.some((p) => Math.abs(p.y - 120) < 1)).toBe(true)
  })

  it('can move the final vertical segment (toward target)', () => {
    const pts0 = resolveRoutePoints(10, 20, 200, 180, [{ x: 100, y: 90 }])
    const lastV = [...angularSegmentHandles(pts0)]
      .reverse()
      .find((s) => s.orient === 'v')
    expect(lastV).toBeTruthy()
    const next = moveAngularSegment(
      10,
      20,
      200,
      180,
      [{ x: 100, y: 90 }],
      lastV!.index,
      { x: 150, y: 100 },
      flow,
    )
    expect(next.length).toBeGreaterThan(0)
    const pts = resolveRoutePoints(10, 20, 200, 180, next)
    // Should no longer be only a vertical stub locked at target x for the whole run
    expect(pts.some((p) => Math.abs(p.x - 150) < 1)).toBe(true)
  })

  it('can move the first horizontal segment', () => {
    const pts0 = resolveRoutePoints(10, 20, 200, 180, [])
    const firstH = angularSegmentHandles(pts0).find((s) => s.index === 0)
    expect(firstH?.orient).toBe('h')
    const next = moveAngularSegment(
      10,
      20,
      200,
      180,
      [],
      0,
      { x: 50, y: 80 },
      flow,
    )
    const pts = resolveRoutePoints(10, 20, 200, 180, next)
    expect(pts.some((p) => Math.abs(p.y - 80) < 1)).toBe(true)
  })

  it('keeps moved segments inside parent bounds', () => {
    const next = moveAngularSegment(
      10,
      20,
      200,
      180,
      [{ x: 100, y: 90 }],
      1,
      { x: 5000, y: 50 },
      flow,
    )
    for (const wp of next) {
      expect(wp.x).toBeLessThanOrEqual(flow.maxX - 10)
      expect(wp.x).toBeGreaterThanOrEqual(flow.minX + 10)
    }
  })
})

describe('translatePoints', () => {
  it('shifts absolute waypoints by parent delta', () => {
    expect(
      translatePoints(
        [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        5,
        -3,
      ),
    ).toEqual([
      { x: 15, y: 17 },
      { x: 35, y: 37 },
    ])
  })

  it('shifts flow bounds with the same delta', () => {
    expect(
      translateFlowBounds(
        { minX: 0, minY: 10, maxX: 100, maxY: 200 },
        8,
        4,
      ),
    ).toEqual({ minX: 8, minY: 14, maxX: 108, maxY: 204 })
  })
})

describe('reattach after port move', () => {
  it('keeps the middle of the route and only stubs to the new port', () => {
    const wps = [
      { x: 100, y: 40 },
      { x: 100, y: 160 },
    ]
    const next = reattachWaypointsToEnds(20, 120, 200, 160, wps)
    const path = resolveRoutePoints(20, 120, 200, 160, next)
    expect(path[0]).toEqual({ x: 20, y: 120 })
    expect(path[path.length - 1]).toEqual({ x: 200, y: 160 })
    expect(path.some((p) => Math.abs(p.x - 100) < 1)).toBe(true)
  })

  it('resolveRoutePoints reattaches instead of dropping the route', () => {
    const wps = [
      { x: 80, y: 50 },
      { x: 80, y: 150 },
      { x: 180, y: 150 },
    ]
    const path = resolveRoutePoints(30, 90, 180, 150, wps)
    expect(path.some((p) => Math.abs(p.x - 80) < 1)).toBe(true)
    expect(path[0]).toEqual({ x: 30, y: 90 })
  })
})
