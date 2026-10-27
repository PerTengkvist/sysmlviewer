/**
 * Pure layout-quality metrics (overlaps, edges through parts, crossings,
 * bends, lengths). Shared by the hierarchic iteration scoring and the
 * Playwright e2e evaluation, so it must stay free of DOM / React Flow.
 */

export type QualityRect = {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type QualityPoint = { x: number; y: number }

export type QualityPolyline = {
  id: string
  points: QualityPoint[]
  /** Part ids at both ends (used to exclude endpoint parts and their ancestors). */
  endpoints: [string, string]
}

export type QualityOptions = {
  /** part id → parent id; ancestor/descendant pairs never count as overlaps. */
  parentOf?: Map<string, string | undefined>
  /** Tolerance for "touching" (default 0.5px). */
  epsilon?: number
}

export type LayoutQualityMetrics = {
  overlaps: number
  edgeThroughParts: number
  crossings: number
  bends: number
  totalEdgeLength: number
  boundingArea: number
}

const DEFAULT_EPS = 0.5

function isAncestor(
  maybeAncestor: string,
  id: string,
  parentOf: Map<string, string | undefined> | undefined,
): boolean {
  if (!parentOf) return false
  let cur = parentOf.get(id)
  const seen = new Set<string>()
  while (cur) {
    if (cur === maybeAncestor) return true
    if (seen.has(cur)) break
    seen.add(cur)
    cur = parentOf.get(cur)
  }
  return false
}

function related(
  a: string,
  b: string,
  parentOf: Map<string, string | undefined> | undefined,
): boolean {
  return isAncestor(a, b, parentOf) || isAncestor(b, a, parentOf)
}

function rectsOverlap(a: QualityRect, b: QualityRect, eps: number): boolean {
  return (
    a.minX + eps < b.maxX &&
    b.minX + eps < a.maxX &&
    a.minY + eps < b.maxY &&
    b.minY + eps < a.maxY
  )
}

/** Overlapping rect pairs (sorted ids), excluding ancestor/descendant pairs. */
export function overlappingPairs(
  rects: QualityRect[],
  opts: QualityOptions = {},
): [string, string][] {
  const eps = opts.epsilon ?? DEFAULT_EPS
  const out: [string, string][] = []
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.id === b.id) continue
      if (related(a.id, b.id, opts.parentOf)) continue
      if (!rectsOverlap(a, b, eps)) continue
      out.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id])
    }
  }
  return out
}

export function countOverlaps(
  rects: QualityRect[],
  opts: QualityOptions = {},
): number {
  return overlappingPairs(rects, opts).length
}

/** True when the open segment passes through the rect interior (not just the border). */
function segmentCutsRect(
  p: QualityPoint,
  q: QualityPoint,
  r: QualityRect,
  eps: number,
): boolean {
  // Liang–Barsky clip against the interior shrunk by eps.
  const minX = r.minX + eps
  const maxX = r.maxX - eps
  const minY = r.minY + eps
  const maxY = r.maxY - eps
  if (minX >= maxX || minY >= maxY) return false
  const dx = q.x - p.x
  const dy = q.y - p.y
  let t0 = 0
  let t1 = 1
  const clip = (den: number, num: number): boolean => {
    if (den === 0) return num >= 0
    const t = num / den
    if (den < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  if (!clip(-dx, p.x - minX)) return false
  if (!clip(dx, maxX - p.x)) return false
  if (!clip(-dy, p.y - minY)) return false
  if (!clip(dy, maxY - p.y)) return false
  return t1 - t0 > 0
}

/**
 * Number of (edge, part) pairs where some segment of the edge passes through
 * the interior of a part that is neither an endpoint nor an ancestor of one.
 */
export function countEdgeThroughParts(
  polylines: QualityPolyline[],
  rects: QualityRect[],
  opts: QualityOptions = {},
): number {
  const eps = opts.epsilon ?? DEFAULT_EPS
  let count = 0
  for (const line of polylines) {
    const [s, t] = line.endpoints
    for (const r of rects) {
      if (r.id === s || r.id === t) continue
      if (isAncestor(r.id, s, opts.parentOf) || isAncestor(r.id, t, opts.parentOf)) {
        continue
      }
      let hit = false
      for (let i = 0; i + 1 < line.points.length && !hit; i++) {
        hit = segmentCutsRect(line.points[i], line.points[i + 1], r, eps)
      }
      if (hit) count += 1
    }
  }
  return count
}

function orient(a: QualityPoint, b: QualityPoint, c: QualityPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function samePoint(a: QualityPoint, b: QualityPoint, eps: number): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

/** Proper crossing of two segments (shared endpoints and collinear overlap excluded). */
function segmentsCross(
  p1: QualityPoint,
  p2: QualityPoint,
  q1: QualityPoint,
  q2: QualityPoint,
  eps: number,
): boolean {
  if (
    samePoint(p1, q1, eps) ||
    samePoint(p1, q2, eps) ||
    samePoint(p2, q1, eps) ||
    samePoint(p2, q2, eps)
  ) {
    return false
  }
  const d1 = orient(q1, q2, p1)
  const d2 = orient(q1, q2, p2)
  const d3 = orient(p1, p2, q1)
  const d4 = orient(p1, p2, q2)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

/** Count proper crossings between segments of different polylines. */
export function countCrossings(
  polylines: QualityPolyline[],
  opts: QualityOptions = {},
): number {
  const eps = opts.epsilon ?? DEFAULT_EPS
  let count = 0
  for (let i = 0; i < polylines.length; i++) {
    const a = polylines[i]
    for (let j = i + 1; j < polylines.length; j++) {
      const b = polylines[j]
      for (let ai = 0; ai + 1 < a.points.length; ai++) {
        for (let bi = 0; bi + 1 < b.points.length; bi++) {
          if (
            segmentsCross(
              a.points[ai],
              a.points[ai + 1],
              b.points[bi],
              b.points[bi + 1],
              eps,
            )
          ) {
            count += 1
          }
        }
      }
    }
  }
  return count
}

/** Number of direction changes across all polylines. */
export function countBends(polylines: QualityPolyline[]): number {
  let bends = 0
  for (const line of polylines) {
    const pts = line.points
    for (let i = 1; i + 1 < pts.length; i++) {
      const dx1 = Math.sign(pts[i].x - pts[i - 1].x)
      const dy1 = Math.sign(pts[i].y - pts[i - 1].y)
      const dx2 = Math.sign(pts[i + 1].x - pts[i].x)
      const dy2 = Math.sign(pts[i + 1].y - pts[i].y)
      if (dx1 === 0 && dy1 === 0) continue
      if (dx2 === 0 && dy2 === 0) continue
      if (dx1 !== dx2 || dy1 !== dy2) bends += 1
    }
  }
  return bends
}

export function totalEdgeLength(polylines: QualityPolyline[]): number {
  let total = 0
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.points.length; i++) {
      total += Math.hypot(
        line.points[i + 1].x - line.points[i].x,
        line.points[i + 1].y - line.points[i].y,
      )
    }
  }
  return total
}

export function boundingArea(rects: QualityRect[]): number {
  if (!rects.length) return 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.minX)
    minY = Math.min(minY, r.minY)
    maxX = Math.max(maxX, r.maxX)
    maxY = Math.max(maxY, r.maxY)
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
}

export function computeLayoutQuality(
  rects: QualityRect[],
  polylines: QualityPolyline[],
  opts: QualityOptions = {},
): LayoutQualityMetrics {
  return {
    overlaps: countOverlaps(rects, opts),
    edgeThroughParts: countEdgeThroughParts(polylines, rects, opts),
    crossings: countCrossings(polylines, opts),
    bends: countBends(polylines),
    totalEdgeLength: totalEdgeLength(polylines),
    boundingArea: boundingArea(rects),
  }
}

export type LayoutScoreWeights = {
  overlap: number
  edgeThroughPart: number
  crossing: number
  bend: number
  /** Per 100px of edge length. */
  length: number
}

export const DEFAULT_SCORE_WEIGHTS: LayoutScoreWeights = {
  overlap: 1000,
  edgeThroughPart: 200,
  crossing: 40,
  bend: 8,
  length: 1,
}

/** Lower is better. */
export function layoutScore(
  m: LayoutQualityMetrics,
  w: LayoutScoreWeights = DEFAULT_SCORE_WEIGHTS,
): number {
  return (
    m.overlaps * w.overlap +
    m.edgeThroughParts * w.edgeThroughPart +
    m.crossings * w.crossing +
    m.bends * w.bend +
    (m.totalEdgeLength / 100) * w.length
  )
}
