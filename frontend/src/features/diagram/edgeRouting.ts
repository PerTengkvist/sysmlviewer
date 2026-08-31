/** Pure helpers for port labels and internal edge waypoints. */

export type PortSide = 'left' | 'right' | 'top' | 'bottom'

export type LabelStyleOpts = { outside?: boolean }

export function portLabelStyle(
  side: PortSide,
  offset: number,
  opts: LabelStyleOpts = {},
): Record<string, string | number> {
  const pct = `${Math.min(0.95, Math.max(0.05, offset)) * 100}%`
  const base: Record<string, string | number> = {
    position: 'absolute',
    fontSize: '0.68rem',
    lineHeight: 1,
    pointerEvents: 'none',
    maxWidth: '42%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    zIndex: 2,
  }
  const outside = !!opts.outside
  switch (side) {
    case 'left':
      return {
        ...base,
        ...(outside
          ? { right: '100%', marginRight: 6, left: 'auto' }
          : { left: 14, right: 'auto' }),
        top: pct,
        transform: 'translateY(-50%)',
        textAlign: outside ? 'right' : 'left',
      }
    case 'right':
      return {
        ...base,
        ...(outside
          ? { left: '100%', marginLeft: 6, right: 'auto' }
          : { right: 14, left: 'auto' }),
        top: pct,
        transform: 'translateY(-50%)',
        textAlign: outside ? 'left' : 'right',
      }
    case 'top':
      return {
        ...base,
        left: pct,
        top: outside ? -14 : 12,
        transform: 'translateX(-50%)',
        textAlign: 'center',
      }
    case 'bottom':
      return {
        ...base,
        left: pct,
        bottom: outside ? -14 : 8,
        top: 'auto',
        transform: 'translateX(-50%)',
        textAlign: 'center',
      }
  }
}

export type Bounds = { width: number; height: number }

/** Absolute flow-space rectangle (e.g. parent part boundary). */
export type FlowBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type Pt = { x: number; y: number; locked?: boolean }

export function clampWaypointToParent(
  wp: { x: number; y: number },
  bounds: Bounds,
  pad = 12,
): { x: number; y: number } {
  return {
    x: Math.min(bounds.width - pad, Math.max(pad, wp.x)),
    y: Math.min(bounds.height - pad, Math.max(pad, wp.y)),
  }
}

export function clampToFlowBounds(wp: Pt, bounds: FlowBounds, pad = 10): Pt {
  return {
    x: Math.min(bounds.maxX - pad, Math.max(bounds.minX + pad, wp.x)),
    y: Math.min(bounds.maxY - pad, Math.max(bounds.minY + pad, wp.y)),
  }
}

export function defaultInternalWaypoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bounds: Bounds,
): { x: number; y: number }[] {
  const mid = clampWaypointToParent(
    { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    bounds,
  )
  return [mid]
}

export function defaultFlowWaypoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bounds: FlowBounds,
): Pt[] {
  return clampWaypointsToFlow(defaultCorners(x1, y1, x2, y2), bounds)
}

export function moveWaypointInList(
  waypoints: { x: number; y: number }[],
  index: number,
  next: { x: number; y: number },
  bounds: Bounds,
): { x: number; y: number }[] {
  return waypoints.map((wp, i) =>
    i === index ? clampWaypointToParent(next, bounds) : wp,
  )
}

export function moveWaypointInFlow(
  waypoints: Pt[],
  index: number,
  next: Pt,
  bounds: FlowBounds,
): Pt[] {
  return waypoints.map((wp, i) => {
    if (i !== index) return wp
    const clamped = clampToFlowBounds(next, bounds)
    return wp.locked ? { ...clamped, locked: true } : clamped
  })
}

/**
 * Legacy knee-style expansion:
 * M src; for each wp: H to wp.x, V to wp.y; H to tx; V to ty.
 */
export function angularPoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
): Pt[] {
  const wps =
    waypoints.length > 0
      ? waypoints
      : [{ x: (sx + tx) / 2, y: (sy + ty) / 2 }]
  const pts: Pt[] = [{ x: sx, y: sy }]
  let cy = sy
  for (const wp of wps) {
    pts.push({ x: wp.x, y: cy })
    pts.push({ x: wp.x, y: wp.y })
    cy = wp.y
  }
  pts.push({ x: tx, y: cy })
  pts.push({ x: tx, y: ty })
  return pts
}

function nearlyEq(a: number, b: number, eps = 0.75): boolean {
  return Math.abs(a - b) < eps
}

function isOrthoChain(pts: Pt[]): boolean {
  if (pts.length < 2) return false
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (!nearlyEq(a.x, b.x) && !nearlyEq(a.y, b.y)) return false
  }
  return true
}

/** Drop zero-length and merge collinear orthogonal runs. */
export function simplifyOrtho(points: Pt[]): Pt[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }))
  const pts: Pt[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const prev = pts[pts.length - 1]
    if (nearlyEq(prev.x, p.x) && nearlyEq(prev.y, p.y)) continue
    pts.push({ ...p })
  }
  let i = 1
  while (i < pts.length - 1) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const colH = nearlyEq(a.y, b.y) && nearlyEq(b.y, c.y)
    const colV = nearlyEq(a.x, b.x) && nearlyEq(b.x, c.x)
    if (colH || colV) {
      pts.splice(i, 1)
      continue
    }
    i++
  }
  return pts
}

function defaultCorners(sx: number, sy: number, tx: number, ty: number): Pt[] {
  const mx = (sx + tx) / 2
  return simplifyOrtho([
    { x: sx, y: sy },
    { x: mx, y: sy },
    { x: mx, y: ty },
    { x: tx, y: ty },
  ]).slice(1, -1)
}

/** Intermediate ortho corners between two points (exclusive of ends). */
function orthoCornersBetween(a: Pt, b: Pt): Pt[] {
  if (nearlyEq(a.x, b.x) || nearlyEq(a.y, b.y)) return []
  return [{ x: b.x, y: a.y }]
}

function closestOnSegment(
  p: Pt,
  a: Pt,
  b: Pt,
): { point: Pt; dist: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-8) {
    return { point: { x: a.x, y: a.y }, dist: Math.hypot(p.x - a.x, p.y - a.y) }
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + t * dx, y: a.y + t * dy }
  return { point, dist: Math.hypot(p.x - point.x, p.y - point.y) }
}

/** Nearest point on an orthogonal polyline (for port re-attach). */
export function closestPointOnPolyline(
  p: Pt,
  path: Pt[],
): { point: Pt; segIndex: number; dist: number } {
  if (!path.length) {
    return { point: { x: p.x, y: p.y }, segIndex: 0, dist: 0 }
  }
  if (path.length === 1) {
    return {
      point: { x: path[0].x, y: path[0].y },
      segIndex: 0,
      dist: Math.hypot(p.x - path[0].x, p.y - path[0].y),
    }
  }
  let best = {
    point: { x: path[0].x, y: path[0].y },
    segIndex: 0,
    dist: Infinity,
  }
  for (let i = 1; i < path.length; i++) {
    const hit = closestOnSegment(p, path[i - 1], path[i])
    if (hit.dist < best.dist) {
      best = { point: hit.point, segIndex: i - 1, dist: hit.dist }
    }
  }
  return best
}

/**
 * After a port move: keep as much of the existing route as possible and only
 * rebuild the stub to the nearest point on that route (orthogonal).
 */
export function reattachWaypointsToEnds(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
): Pt[] {
  if (!waypoints.length) return defaultCorners(sx, sy, tx, ty)

  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const srcOk = nearlyEq(first.x, sx) || nearlyEq(first.y, sy)
  const endOk = nearlyEq(last.x, tx) || nearlyEq(last.y, ty)
  if (srcOk && endOk) {
    const chain = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
    if (isOrthoChain(chain)) return waypoints.map((w) => ({ ...w }))
  }

  const spine = waypoints.map((w) => ({ x: w.x, y: w.y, locked: w.locked }))
  const src = { x: sx, y: sy }
  const tgt = { x: tx, y: ty }

  let kept: Pt[]
  if (!srcOk && endOk) {
    const near = closestPointOnPolyline(src, spine)
    kept = [
      { x: near.point.x, y: near.point.y },
      ...spine.slice(near.segIndex + 1),
    ]
  } else if (srcOk && !endOk) {
    const near = closestPointOnPolyline(tgt, spine)
    kept = [
      ...spine.slice(0, near.segIndex + 1),
      { x: near.point.x, y: near.point.y },
    ]
  } else {
    // Both ends detached — reconnect each to its nearest spine point.
    const nearS = closestPointOnPolyline(src, spine)
    const nearT = closestPointOnPolyline(tgt, spine)
    const a = Math.min(nearS.segIndex, nearT.segIndex)
    const b = Math.max(nearS.segIndex, nearT.segIndex)
    const startPt =
      nearS.segIndex <= nearT.segIndex ? nearS.point : nearT.point
    const endPt =
      nearS.segIndex <= nearT.segIndex ? nearT.point : nearS.point
    kept = [
      { x: startPt.x, y: startPt.y },
      ...spine.slice(a + 1, b + 1),
      { x: endPt.x, y: endPt.y },
    ]
    // If source mapped to the "end" side of the span, swap reconnect order
    // by falling back to a simple L when the span collapses.
    if (nearS.segIndex > nearT.segIndex) {
      return defaultCorners(sx, sy, tx, ty)
    }
  }

  if (!kept.length) return defaultCorners(sx, sy, tx, ty)

  const joinS = kept[0]
  const joinT = kept[kept.length - 1]
  const full = simplifyOrtho([
    src,
    ...orthoCornersBetween(src, joinS),
    ...kept,
    ...orthoCornersBetween(joinT, tgt),
    tgt,
  ])

  const locked = waypoints.filter((w) => w.locked)
  const corners = full.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
  if (!locked.length) return corners
  return corners.map((c) => {
    const hit = locked.find((l) => Math.hypot(l.x - c.x, l.y - c.y) < 2.5)
    return hit ? { x: hit.x, y: hit.y, locked: true as const } : c
  })
}

/**
 * Resolve stored waypoints to a full orthogonal polyline.
 * Supports legacy knee waypoints and corner lists (preferred after edits).
 *
 * When unlocked corners no longer attach to the current port endpoints
 * (e.g. after a port slide), re-attach to the nearest point on the route
 * instead of discarding the whole path.
 */
export function resolveRoutePoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
): Pt[] {
  if (!waypoints.length) {
    return simplifyOrtho([
      { x: sx, y: sy },
      ...defaultCorners(sx, sy, tx, ty),
      { x: tx, y: ty },
    ])
  }

  const asCorners = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const srcOk = nearlyEqPt(first.x, sx) || nearlyEqPt(first.y, sy)
  const endOk = nearlyEqPt(last.x, tx) || nearlyEqPt(last.y, ty)
  if (srcOk && endOk && isOrthoChain(asCorners)) {
    return simplifyOrtho(asCorners)
  }

  // Port moved (or stale knees): keep the route, only rebuild end stubs.
  const repaired = reattachWaypointsToEnds(sx, sy, tx, ty, waypoints)
  return simplifyOrtho([
    { x: sx, y: sy },
    ...repaired,
    { x: tx, y: ty },
  ])
}

function nearlyEqPt(a: number, b: number, eps = 0.75): boolean {
  return Math.abs(a - b) < eps
}

/** Drop unlocked waypoints that do not attach to current port ends. */
export function filterAttachedOrLocked(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
): Pt[] {
  if (!waypoints.length) return []
  const locked = waypoints.filter((w) => w.locked)
  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const startOk = nearlyEqPt(first.x, sx) || nearlyEqPt(first.y, sy)
  const endOk = nearlyEqPt(last.x, tx) || nearlyEqPt(last.y, ty)
  const chain = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
  let ortho = true
  for (let i = 1; i < chain.length; i++) {
    const p = chain[i - 1]
    const q = chain[i]
    if (!nearlyEqPt(p.x, q.x) && !nearlyEqPt(p.y, q.y)) {
      ortho = false
      break
    }
  }
  if (startOk && endOk && ortho) return waypoints
  // Stale unlocked corners — keep only locked vias
  return locked
}

export function cornersFromPoints(points: Pt[]): Pt[] {
  if (points.length <= 2) return []
  return points.slice(1, -1).map((p) => ({ ...p }))
}

export function angularPathD(points: Pt[]): string {
  if (!points.length) return ''
  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x},${points[i].y}`
  }
  return d
}

export type SegmentHandle = {
  index: number
  orient: 'h' | 'v'
  mid: Pt
}

export function angularSegmentHandles(points: Pt[]): SegmentHandle[] {
  const out: SegmentHandle[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.hypot(dx, dy) < 2) continue
    const orient: 'h' | 'v' = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
    out.push({
      index: i,
      orient,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    })
  }
  return out
}

/**
 * Slide an orthogonal segment: vertical → X, horizontal → Y.
 * Terminal-adjacent segments insert elbows so every visible segment is movable.
 * Returns corner waypoints (intermediate points only).
 */
export function moveAngularSegment(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
  segmentIndex: number,
  pointer: Pt,
  bounds: FlowBounds,
): Pt[] {
  const ptr = clampToFlowBounds(pointer, bounds)
  let pts = resolveRoutePoints(sx, sy, tx, ty, waypoints).map((p) => ({
    ...p,
  }))
  // Keep terminals fixed
  pts[0] = { x: sx, y: sy }
  pts[pts.length - 1] = { x: tx, y: ty }

  if (segmentIndex < 0 || segmentIndex >= pts.length - 1) {
    return clampWaypointsToFlow(cornersFromPoints(pts), bounds)
  }

  const a = pts[segmentIndex]
  const b = pts[segmentIndex + 1]
  const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y)
  const startFixed = segmentIndex === 0
  const endFixed = segmentIndex + 1 === pts.length - 1

  if (vertical) {
    const x = ptr.x
    if (!startFixed && !endFixed) {
      pts[segmentIndex] = { ...pts[segmentIndex], x }
      pts[segmentIndex + 1] = { ...pts[segmentIndex + 1], x }
    } else if (startFixed && !endFixed) {
      pts.splice(1, 0, { x, y: sy })
      pts[2] = { ...pts[2], x }
    } else if (!startFixed && endFixed) {
      pts[segmentIndex] = { ...pts[segmentIndex], x }
      pts.splice(pts.length - 1, 0, { x, y: ty })
    } else {
      pts = [
        { x: sx, y: sy },
        { x, y: sy },
        { x, y: ty },
        { x: tx, y: ty },
      ]
    }
  } else {
    const y = ptr.y
    if (!startFixed && !endFixed) {
      pts[segmentIndex] = { ...pts[segmentIndex], y }
      pts[segmentIndex + 1] = { ...pts[segmentIndex + 1], y }
    } else if (startFixed && !endFixed) {
      pts.splice(1, 0, { x: sx, y })
      pts[2] = { ...pts[2], y }
    } else if (!startFixed && endFixed) {
      pts[segmentIndex] = { ...pts[segmentIndex], y }
      pts.splice(pts.length - 1, 0, { x: tx, y })
    } else {
      pts = [
        { x: sx, y: sy },
        { x: sx, y },
        { x: tx, y },
        { x: tx, y: ty },
      ]
    }
  }

  pts[0] = { x: sx, y: sy }
  pts[pts.length - 1] = { x: tx, y: ty }
  pts = simplifyOrtho(pts)
  return clampWaypointsToFlow(cornersFromPoints(pts), bounds)
}

/** Clamp every waypoint into the parent; used when rendering/persisting. */
export function clampWaypointsToFlow(waypoints: Pt[], bounds: FlowBounds): Pt[] {
  return waypoints.map((w) => clampToFlowBounds(w, bounds))
}

/** Shift absolute flow-space points by a canvas delta (e.g. parent part moved). */
export function translatePoints(points: Pt[], dx: number, dy: number): Pt[] {
  if (!dx && !dy) return points.map((p) => ({ ...p }))
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function translateFlowBounds(
  bounds: FlowBounds,
  dx: number,
  dy: number,
): FlowBounds {
  if (!dx && !dy) return { ...bounds }
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
  }
}
