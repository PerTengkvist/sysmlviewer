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

export type Pt = { x: number; y: number }

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
  return waypoints.map((wp, i) =>
    i === index ? clampToFlowBounds(next, bounds) : wp,
  )
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

/**
 * Resolve stored waypoints to a full orthogonal polyline.
 * Supports legacy knee waypoints and corner lists (preferred after edits).
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
  if (isOrthoChain(asCorners)) {
    return simplifyOrtho(asCorners)
  }
  // legacy knee
  return simplifyOrtho(angularPoints(sx, sy, tx, ty, waypoints))
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
