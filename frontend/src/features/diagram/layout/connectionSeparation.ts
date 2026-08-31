/**
 * Keep only locked waypoints; drop stale absolute corners after port moves.
 * Also: parallel-lane separation and crossing jumpers for unrelated nets.
 */
import type { Pt } from '../edgeRouting'
import { simplifyOrtho } from '../edgeRouting'

export type PortRef = { sourcePort: string; targetPort: string }

export type RoutedPoly = {
  id: string
  points: Pt[] // full polyline including endpoints
  sourcePort: string
  targetPort: string
}

export type PathJump = {
  x: number
  y: number
  /** Segment orientation of the jumping (overlying) wire at the cross. */
  along: 'h' | 'v'
}

const EPS = 0.75

function nearlyEq(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) < eps
}

export function sharePort(a: PortRef, b: PortRef): boolean {
  const ap = new Set([a.sourcePort, a.targetPort])
  return ap.has(b.sourcePort) || ap.has(b.targetPort)
}

/** Ortho attach: first corner shares x or y with start; last with end. */
export function waypointsAttachToEnds(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
): boolean {
  if (!waypoints.length) return true
  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const startOk = nearlyEq(first.x, sx) || nearlyEq(first.y, sy)
  const endOk = nearlyEq(last.x, tx) || nearlyEq(last.y, ty)
  if (!startOk || !endOk) return false
  const chain = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
  for (let i = 1; i < chain.length; i++) {
    const p = chain[i - 1]
    const q = chain[i]
    if (!nearlyEq(p.x, q.x) && !nearlyEq(p.y, q.y)) return false
  }
  return true
}

/** Keep locked vias only (unlocked absolute corners are discarded). */
export function keepLockedWaypoints(waypoints: Pt[] | undefined): Pt[] {
  return (waypoints || []).filter((w) => w.locked)
}

function segmentOrient(a: Pt, b: Pt): 'h' | 'v' | null {
  if (nearlyEq(a.y, b.y) && !nearlyEq(a.x, b.x)) return 'h'
  if (nearlyEq(a.x, b.x) && !nearlyEq(a.y, b.y)) return 'v'
  return null
}

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  pad = 0,
): boolean {
  const alo = Math.min(a0, a1) - pad
  const ahi = Math.max(a0, a1) + pad
  const blo = Math.min(b0, b1)
  const bhi = Math.max(b0, b1)
  return alo < bhi && ahi > blo
}

function segmentCross(
  a1: Pt,
  a2: Pt,
  b1: Pt,
  b2: Pt,
): Pt | null {
  const oa = segmentOrient(a1, a2)
  const ob = segmentOrient(b1, b2)
  if (!oa || !ob || oa === ob) return null
  if (oa === 'h' && ob === 'v') {
    const y = a1.y
    const x = b1.x
    if (
      rangesOverlap(a1.x, a2.x, x, x) &&
      rangesOverlap(b1.y, b2.y, y, y) &&
      !nearlyEq(x, a1.x) &&
      !nearlyEq(x, a2.x) &&
      !nearlyEq(y, b1.y) &&
      !nearlyEq(y, b2.y)
    ) {
      return { x, y }
    }
  }
  if (oa === 'v' && ob === 'h') {
    const x = a1.x
    const y = b1.y
    if (
      rangesOverlap(a1.y, a2.y, y, y) &&
      rangesOverlap(b1.x, b2.x, x, x) &&
      !nearlyEq(y, a1.y) &&
      !nearlyEq(y, a2.y) &&
      !nearlyEq(x, b1.x) &&
      !nearlyEq(x, b2.x)
    ) {
      return { x, y }
    }
  }
  return null
}

type SegRef = {
  routeIdx: number
  segIdx: number
  coord: number
  lo: number
  hi: number
}

/**
 * Offset parallel tracks of unrelated nets so they keep `separation` gap.
 * Related nets (shared port) may stay coincident.
 */
export function separateUnrelatedRoutes(
  routes: RoutedPoly[],
  separation: number,
): RoutedPoly[] {
  if (separation <= 0 || routes.length < 2) {
    return routes.map((r) => ({
      ...r,
      points: r.points.map((p) => ({ ...p })),
    }))
  }

  const out = routes.map((r) => ({
    ...r,
    points: r.points.map((p) => ({ ...p })),
  }))

  const collectSegments = (axis: 'x' | 'y'): SegRef[] => {
    const segs: SegRef[] = []
    for (let ri = 0; ri < out.length; ri++) {
      const pts = out[ri].points
      for (let si = 0; si < pts.length - 1; si++) {
        const a = pts[si]
        const b = pts[si + 1]
        const o = segmentOrient(a, b)
        if (axis === 'x' && o === 'v') {
          segs.push({
            routeIdx: ri,
            segIdx: si,
            coord: a.x,
            lo: Math.min(a.y, b.y),
            hi: Math.max(a.y, b.y),
          })
        } else if (axis === 'y' && o === 'h') {
          segs.push({
            routeIdx: ri,
            segIdx: si,
            coord: a.y,
            lo: Math.min(a.x, b.x),
            hi: Math.max(a.x, b.x),
          })
        }
      }
    }
    return segs
  }

  const shiftPoint = (ri: number, pi: number, dx: number, dy: number) => {
    const p = out[ri].points[pi]
    out[ri].points[pi] = { ...p, x: p.x + dx, y: p.y + dy }
  }

  const separateAxis = (axis: 'x' | 'y') => {
    const segs = collectSegments(axis)
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i]
        const B = segs[j]
        if (A.routeIdx === B.routeIdx) continue
        const ra = out[A.routeIdx]
        const rb = out[B.routeIdx]
        if (sharePort(ra, rb)) continue
        if (!rangesOverlap(A.lo, A.hi, B.lo, B.hi, 0)) continue

        const gap = Math.abs(A.coord - B.coord)
        if (gap >= separation) continue

        const swap = ra.id > rb.id
        const high = swap ? A : B
        const delta = separation - gap
        if (axis === 'x') {
          shiftPoint(high.routeIdx, high.segIdx, delta, 0)
          shiftPoint(high.routeIdx, high.segIdx + 1, delta, 0)
          high.coord += delta
        } else {
          shiftPoint(high.routeIdx, high.segIdx, 0, delta)
          shiftPoint(high.routeIdx, high.segIdx + 1, 0, delta)
          high.coord += delta
        }
      }
    }
  }

  // Multiple passes — shifting one pair can bring another pair too close.
  for (let pass = 0; pass < 8; pass++) {
    const before = out.map((r) => r.points.map((p) => `${p.x},${p.y}`).join('|'))
    separateAxis('x')
    separateAxis('y')
    const after = out.map((r) => r.points.map((p) => `${p.x},${p.y}`).join('|'))
    if (before.every((s, i) => s === after[i])) break
  }

  return out.map((r) => ({
    ...r,
    points: simplifyOrtho(r.points),
  }))
}

/**
 * For each unrelated crossing, put a jumper on the overlying route
 * (lexicographically greater id).
 */
export function computeJumpers(
  routes: RoutedPoly[],
  minDistFromEnds = 8,
): Map<string, PathJump[]> {
  const jumps = new Map<string, PathJump[]>()
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i]
      const b = routes[j]
      if (sharePort(a, b)) continue
      const overlying = a.id >= b.id ? a : b
      const under = a.id >= b.id ? b : a
      for (let ai = 0; ai < overlying.points.length - 1; ai++) {
        const a1 = overlying.points[ai]
        const a2 = overlying.points[ai + 1]
        const along = segmentOrient(a1, a2)
        if (!along) continue
        for (let bi = 0; bi < under.points.length - 1; bi++) {
          const cross = segmentCross(a1, a2, under.points[bi], under.points[bi + 1])
          if (!cross) continue
          // Skip near endpoints of either segment (shared corners)
          const da = Math.min(
            Math.hypot(cross.x - a1.x, cross.y - a1.y),
            Math.hypot(cross.x - a2.x, cross.y - a2.y),
          )
          const db = Math.min(
            Math.hypot(cross.x - under.points[bi].x, cross.y - under.points[bi].y),
            Math.hypot(cross.x - under.points[bi + 1].x, cross.y - under.points[bi + 1].y),
          )
          if (da < minDistFromEnds || db < minDistFromEnds) continue
          const list = jumps.get(overlying.id) || []
          if (!list.some((j) => nearlyEq(j.x, cross.x) && nearlyEq(j.y, cross.y))) {
            list.push({ x: cross.x, y: cross.y, along })
            jumps.set(overlying.id, list)
          }
        }
      }
    }
  }
  return jumps
}

/** SVG path with semicircle jumpers on orthogonal polylines. */
export function angularPathDWithJumps(
  points: Pt[],
  jumps: PathJump[],
  radius = 5,
): string {
  if (!points.length) return ''
  if (!jumps.length) {
    let d = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`
    }
    return d
  }

  const r = Math.max(2, radius)
  let d = `M ${points[0].x},${points[0].y}`

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const orient = segmentOrient(a, b)
    const onSeg = jumps
      .filter((j) => {
        if (!orient || j.along !== orient) return false
        if (orient === 'h') {
          return (
            nearlyEq(j.y, a.y) &&
            j.x > Math.min(a.x, b.x) + r &&
            j.x < Math.max(a.x, b.x) - r
          )
        }
        return (
          nearlyEq(j.x, a.x) &&
          j.y > Math.min(a.y, b.y) + r &&
          j.y < Math.max(a.y, b.y) - r
        )
      })
      .sort((p, q) => {
        if (orient === 'h') {
          return (a.x <= b.x ? p.x - q.x : q.x - p.x)
        }
        return a.y <= b.y ? p.y - q.y : q.y - p.y
      })

    if (!onSeg.length || !orient) {
      d += ` L ${b.x},${b.y}`
      continue
    }

    for (const j of onSeg) {
      if (orient === 'h') {
        const dir = b.x >= a.x ? 1 : -1
        d += ` L ${j.x - dir * r},${j.y}`
        // Sweep north (negative y) semicircle
        d += ` A ${r},${r} 0 0 ${dir > 0 ? 1 : 0} ${j.x + dir * r},${j.y}`
      } else {
        const dir = b.y >= a.y ? 1 : -1
        d += ` L ${j.x},${j.y - dir * r}`
        d += ` A ${r},${r} 0 0 ${dir > 0 ? 1 : 0} ${j.x},${j.y + dir * r}`
      }
    }
    d += ` L ${b.x},${b.y}`
  }
  return d
}

/** Corners only (drop endpoints) from a full polyline. */
export function cornersFromFull(points: Pt[]): Pt[] {
  if (points.length <= 2) return []
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y, locked: p.locked }))
}
