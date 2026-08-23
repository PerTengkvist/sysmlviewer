import type { Edge, Node } from '@xyflow/react'
import { resolveRoutePoints, simplifyOrtho, type FlowBounds, type PortSide, type Pt } from '../edgeRouting'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  computeJumpers,
  cornersFromFull,
  separateUnrelatedRoutes,
} from './connectionSeparation'

export type Rect = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type RoutedConnection = {
  id: string
  waypoints: Pt[]
  /** Crossing jumpers for unrelated nets (overlying wire). */
  jumps?: { x: number; y: number; along: 'h' | 'v' }[]
}

export type ExistingEdgeRoute = {
  id: string
  waypoints?: Pt[]
}

export type RedrawOptions = {
  /** Min gap between unrelated parallel tracks (flow px). */
  separation?: number
  /** All edges used for lane separation and jumpers (defaults to routed set). */
  contextEdges?: Edge[]
}

const CELL = 4
const OBSTACLE_PAD = 8
const STUB_LEN = 12
const BOUNDS_PAD = 4
const TURN_COST = 1
const ESCAPE_PAD = 48

function nearlyEq(a: number, b: number, eps = 0.75): boolean {
  return Math.abs(a - b) < eps
}

export function inflateRect(r: Rect, pad: number): Rect {
  return {
    minX: r.minX - pad,
    minY: r.minY - pad,
    maxX: r.maxX + pad,
    maxY: r.maxY + pad,
  }
}

function pointInRect(p: Pt, r: Rect, inset = 0): boolean {
  return (
    p.x > r.minX + inset &&
    p.x < r.maxX - inset &&
    p.y > r.minY + inset &&
    p.y < r.maxY - inset
  )
}

/** True if an orthogonal polyline crosses the strict interior of `r`. */
export function polylineHitsRect(path: Pt[], r: Rect): boolean {
  for (let i = 1; i < path.length; i++) {
    if (segmentHitsRect(path[i - 1], path[i], r)) return true
  }
  return false
}

function segmentHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  const inset = 0.51
  const minX = r.minX + inset
  const maxX = r.maxX - inset
  const minY = r.minY + inset
  const maxY = r.maxY - inset
  if (minX >= maxX || minY >= maxY) return false

  if (nearlyEq(a.y, b.y)) {
    const y = a.y
    if (y <= minY || y >= maxY) return false
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    return lo < maxX && hi > minX
  }
  if (nearlyEq(a.x, b.x)) {
    const x = a.x
    if (x <= minX || x >= maxX) return false
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    return lo < maxY && hi > minY
  }
  return true
}

function pathHitsAny(path: Pt[], rects: Rect[]): boolean {
  return rects.some((r) => polylineHitsRect(path, r))
}

function hvPath(a: Pt, b: Pt): Pt[] {
  if (nearlyEq(a.x, b.x) || nearlyEq(a.y, b.y)) return [a, b]
  return [a, { x: b.x, y: a.y }, b]
}

function vhPath(a: Pt, b: Pt): Pt[] {
  if (nearlyEq(a.x, b.x) || nearlyEq(a.y, b.y)) return [a, b]
  return [a, { x: a.x, y: b.y }, b]
}

function clampPt(p: Pt, b: Rect): Pt {
  return {
    x: Math.min(b.maxX, Math.max(b.minX, p.x)),
    y: Math.min(b.maxY, Math.max(b.minY, p.y)),
  }
}

/**
 * Orthogonal path from start to end that stays inside `bounds` and does not
 * cross obstacle interiors. Never returns a path that cuts through a part.
 */
export function routeOrthogonal(
  start: Pt,
  end: Pt,
  obstacles: Rect[],
  bounds: Rect,
): Pt[] {
  const padded = inflateRect(bounds, -BOUNDS_PAD)
  const walk =
    padded.minX < padded.maxX && padded.minY < padded.maxY ? padded : bounds
  const a = clampPt(start, walk)
  const b = clampPt(end, walk)
  const inflated = obstacles.map((r) => inflateRect(r, OBSTACLE_PAD))

  const tryCandidates = (searchBounds: Rect): Pt[] | null => {
    const hv = hvPath(a, b)
    if (!pathHitsAny(hv, inflated)) return simplifyOrtho(hv)
    const vh = vhPath(a, b)
    if (!pathHitsAny(vh, inflated)) return simplifyOrtho(vh)
    const viaGrid = astarPath(a, b, inflated, searchBounds)
    if (viaGrid && !pathHitsAny(viaGrid, inflated)) return simplifyOrtho(viaGrid)
    return null
  }

  const direct = tryCandidates(walk)
  if (direct) return direct

  const expanded = inflateRect(walk, ESCAPE_PAD)
  const expandedHit = tryCandidates(expanded)
  if (expandedHit) return expandedHit

  const viaCorners = routeViaObstacleCorners(a, b, inflated, expanded)
  if (viaCorners) return viaCorners

  const hull = unionRects(inflated, OBSTACLE_PAD)
  if (hull) {
    const escape = routeViaHullEscape(a, b, hull, inflated, expanded)
    if (escape) return escape
  }

  // Last resort: far-side U-turn that clears the union hull — must not cut parts.
  const clear = unionRects(inflated, ESCAPE_PAD) || expanded
  const candidates: Pt[][] = [
    simplifyOrtho([
      a,
      { x: a.x, y: clear.minY },
      { x: b.x, y: clear.minY },
      b,
    ]),
    simplifyOrtho([
      a,
      { x: a.x, y: clear.maxY },
      { x: b.x, y: clear.maxY },
      b,
    ]),
    simplifyOrtho([
      a,
      { x: clear.minX, y: a.y },
      { x: clear.minX, y: b.y },
      b,
    ]),
    simplifyOrtho([
      a,
      { x: clear.maxX, y: a.y },
      { x: clear.maxX, y: b.y },
      b,
    ]),
  ]
  for (const c of candidates) {
    if (!pathHitsAny(c, inflated)) return c
  }

  // Expand farther and retry U-turns — never silently accept a through-cut.
  const far = inflateRect(expanded, ESCAPE_PAD * 2)
  const farCandidates: Pt[][] = [
    simplifyOrtho([a, { x: a.x, y: far.minY }, { x: b.x, y: far.minY }, b]),
    simplifyOrtho([a, { x: a.x, y: far.maxY }, { x: b.x, y: far.maxY }, b]),
    simplifyOrtho([a, { x: far.minX, y: a.y }, { x: far.minX, y: b.y }, b]),
    simplifyOrtho([a, { x: far.maxX, y: a.y }, { x: far.maxX, y: b.y }, b]),
  ]
  for (const c of farCandidates) {
    if (!pathHitsAny(c, inflated)) return c
  }

  // Prefer any non-hitting candidate from the first set; else the shortest far escape.
  return farCandidates.sort((p, q) => pathLength(p) - pathLength(q))[0]
}

function pathLength(pts: Pt[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) {
    n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return n
}

function routeViaObstacleCorners(
  a: Pt,
  b: Pt,
  inflated: Rect[],
  bounds: Rect,
): Pt[] | null {
  const vias: Pt[] = []
  const m = 4
  for (const ob of inflated) {
    vias.push(
      { x: ob.minX - m, y: ob.minY - m },
      { x: ob.maxX + m, y: ob.minY - m },
      { x: ob.minX - m, y: ob.maxY + m },
      { x: ob.maxX + m, y: ob.maxY + m },
      { x: (ob.minX + ob.maxX) / 2, y: ob.minY - m },
      { x: (ob.minX + ob.maxX) / 2, y: ob.maxY + m },
      { x: ob.minX - m, y: (ob.minY + ob.maxY) / 2 },
      { x: ob.maxX + m, y: (ob.minY + ob.maxY) / 2 },
    )
  }

  const leg = (from: Pt, to: Pt): Pt[] | null => {
    const hv = hvPath(from, to)
    if (!pathHitsAny(hv, inflated)) return hv
    const vh = vhPath(from, to)
    if (!pathHitsAny(vh, inflated)) return vh
    return null
  }

  let best: Pt[] | null = null
  let bestLen = Infinity
  for (const raw of vias) {
    const v = clampPt(raw, bounds)
    if (inflated.some((ob) => pointInRect(v, ob, 0))) continue
    const left = leg(a, v)
    const right = leg(v, b)
    if (!left || !right) continue
    const merged = simplifyOrtho([...left, ...right.slice(1)])
    if (pathHitsAny(merged, inflated)) continue
    const len = pathLength(merged)
    if (len < bestLen) {
      bestLen = len
      best = merged
    }
  }
  return best
}

function routeViaHullEscape(
  a: Pt,
  b: Pt,
  hull: Rect,
  inflated: Rect[],
  bounds: Rect,
): Pt[] | null {
  const m = 8
  const sides: Pt[][] = [
    [
      a,
      { x: a.x, y: hull.minY - m },
      { x: b.x, y: hull.minY - m },
      b,
    ],
    [
      a,
      { x: a.x, y: hull.maxY + m },
      { x: b.x, y: hull.maxY + m },
      b,
    ],
    [
      a,
      { x: hull.minX - m, y: a.y },
      { x: hull.minX - m, y: b.y },
      b,
    ],
    [
      a,
      { x: hull.maxX + m, y: a.y },
      { x: hull.maxX + m, y: b.y },
      b,
    ],
  ]
  let best: Pt[] | null = null
  let bestLen = Infinity
  for (const raw of sides) {
    const pts = simplifyOrtho(
      raw.map((p) => clampPt(p, inflateRect(bounds, ESCAPE_PAD))),
    )
    if (pathHitsAny(pts, inflated)) continue
    const len = pathLength(pts)
    if (len < bestLen) {
      bestLen = len
      best = pts
    }
  }
  return best
}

/** True if an orthogonal polyline crosses any obstacle interior. */
export function pathCrossesObstacles(path: Pt[], obstacles: Rect[]): boolean {
  const inflated = obstacles.map((r) => inflateRect(r, OBSTACLE_PAD))
  return pathHitsAny(path, inflated)
}

/**
 * Like pathCrossesObstacles but ignores short port-stub segments at the ends.
 * Important: also covers 3-point L-routes (previously skipped entirely when
 * `path.length < 4`, which let vertical cuts through intervening parts slip by).
 */
export function pathCrossesObstaclesMid(path: Pt[], obstacles: Rect[]): boolean {
  if (path.length < 2 || !obstacles.length) return false
  const inflated = obstacles.map((r) => inflateRect(r, OBSTACLE_PAD))
  const stubMax = STUB_LEN + OBSTACLE_PAD + 1
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const isEndSeg = i === 1 || i === path.length - 1
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (isEndSeg && len <= stubMax) continue
    for (const r of inflated) {
      if (segmentHitsRect(a, b, r)) return true
    }
  }
  return false
}

function astarPath(start: Pt, end: Pt, obstacles: Rect[], bounds: Rect): Pt[] | null {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width < CELL || height < CELL) return null

  const cols = Math.max(1, Math.ceil(width / CELL))
  const rows = Math.max(1, Math.ceil(height / CELL))

  const blocked = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = cellCenter(c, r, bounds)
      if (obstacles.some((ob) => pointInRect(p, ob, 0))) {
        blocked[r * cols + c] = 1
      }
    }
  }

  const sc = cellIndex(start, bounds, cols, rows)
  const gc = cellIndex(end, bounds, cols, rows)
  blocked[sc.r * cols + sc.c] = 0
  blocked[gc.r * cols + gc.c] = 0

  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]
  const stateCount = cols * rows * 4
  const dist = new Float64Array(stateCount)
  dist.fill(Infinity)
  const prev = new Int32Array(stateCount)
  prev.fill(-1)

  const heap: number[] = []
  const startKey = (sc.r * cols + sc.c) * 4
  for (let d = 0; d < 4; d++) {
    const k = startKey + d
    dist[k] = 0
    heap.push(k)
  }

  const heuristic = (c: number, r: number) =>
    Math.abs(c - gc.c) + Math.abs(r - gc.r)

  let goalState = -1
  while (heap.length) {
    let bestI = 0
    let bestF = Infinity
    for (let i = 0; i < heap.length; i++) {
      const k = heap[i]
      const c = Math.floor(k / 4) % cols
      const r = Math.floor(Math.floor(k / 4) / cols)
      const f = dist[k] + heuristic(c, r)
      if (f < bestF) {
        bestF = f
        bestI = i
      }
    }
    const k = heap[bestI]
    heap[bestI] = heap[heap.length - 1]
    heap.pop()

    const dir = k % 4
    const cell = Math.floor(k / 4)
    const c = cell % cols
    const r = Math.floor(cell / cols)
    if (c === gc.c && r === gc.r) {
      goalState = k
      break
    }

    for (let nd = 0; nd < 4; nd++) {
      const nc = c + dirs[nd][0]
      const nr = r + dirs[nd][1]
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      if (blocked[nr * cols + nc]) continue
      const nk = (nr * cols + nc) * 4 + nd
      const step = 1 + (nd === dir ? 0 : TURN_COST)
      const next = dist[k] + step
      if (next < dist[nk]) {
        dist[nk] = next
        prev[nk] = k
        heap.push(nk)
      }
    }
  }

  if (goalState < 0) return null

  const cells: { c: number; r: number }[] = []
  let cur = goalState
  while (cur >= 0) {
    const cell = Math.floor(cur / 4)
    cells.push({ c: cell % cols, r: Math.floor(cell / cols) })
    cur = prev[cur]
  }
  cells.reverse()

  const pts: Pt[] = [start]
  for (const cell of cells) {
    pts.push(cellCenter(cell.c, cell.r, bounds))
  }
  pts.push(end)
  return pts
}

function cellCenter(c: number, r: number, bounds: Rect): Pt {
  return {
    x: bounds.minX + (c + 0.5) * CELL,
    y: bounds.minY + (r + 0.5) * CELL,
  }
}

function cellIndex(
  p: Pt,
  bounds: Rect,
  cols: number,
  rows: number,
): { c: number; r: number } {
  const c = Math.min(
    cols - 1,
    Math.max(0, Math.floor((p.x - bounds.minX) / CELL)),
  )
  const r = Math.min(
    rows - 1,
    Math.max(0, Math.floor((p.y - bounds.minY) / CELL)),
  )
  return { c, r }
}

function readPx(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const n = parseFloat(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return fallback
}

function nodeSize(n: Node): { width: number; height: number } {
  return {
    width: readPx(n.style?.width ?? n.width ?? n.measured?.width, 180),
    height: readPx(n.style?.height ?? n.height ?? n.measured?.height, 110),
  }
}

function absoluteOrigin(node: Node, byId: Map<string, Node>): Pt {
  let x = node.position.x
  let y = node.position.y
  let pid = node.parentId
  while (pid) {
    const parent = byId.get(pid)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    pid = parent.parentId
  }
  return { x, y }
}

function nodeRect(node: Node, byId: Map<string, Node>): Rect {
  const o = absoluteOrigin(node, byId)
  const { width, height } = nodeSize(node)
  return { minX: o.x, minY: o.y, maxX: o.x + width, maxY: o.y + height }
}

/** Absolute obstacle rects for every non-boundary part (for display + redraw). */
export function partObstacleRects(
  nodes: Node[],
): { id: string; minX: number; minY: number; maxX: number; maxY: number }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes
    .filter((n) => n.type === 'part' || !n.type)
    .filter((n) => !isBoundary(n))
    .map((n) => {
      const r = nodeRect(n, byId)
      return { id: n.id, ...r }
    })
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

/** Absolute flow coords of an edge's source/target port handles. */
export function edgePortEndpoints(
  nodes: Node[],
  edge: Edge,
): { sx: number; sy: number; tx: number; ty: number } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const srcNode = byId.get(edge.source)
  const tgtNode = byId.get(edge.target)
  if (!srcNode || !tgtNode) return null
  const srcPortId = portIdFromHandle(edge.sourceHandle)
  const tgtPortId = portIdFromHandle(edge.targetHandle)
  const srcPort = portsOf(srcNode).find((p) => p.id === srcPortId)
  const tgtPort = portsOf(tgtNode).find((p) => p.id === tgtPortId)
  if (!srcPort || !tgtPort) return null
  const srcRect = nodeRect(srcNode, byId)
  const tgtRect = nodeRect(tgtNode, byId)
  const start = portPoint(
    srcRect,
    srcPort.side || 'right',
    srcPort.offset ?? 0.5,
  )
  const end = portPoint(
    tgtRect,
    tgtPort.side || 'left',
    tgtPort.offset ?? 0.5,
  )
  return { sx: start.x, sy: start.y, tx: end.x, ty: end.y }
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

/** Absolute flow bounds of the whitebox boundary part (for clamping internal wires). */
export function boundaryFlowBounds(nodes: Node[]): FlowBounds | null {
  const boundary = nodes.find((n) => isBoundary(n))
  if (!boundary) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const r = nodeRect(boundary, byId)
  return { minX: r.minX, minY: r.minY, maxX: r.maxX, maxY: r.maxY }
}

/** Keep internal edge clamp rects aligned with the live whitebox boundary. */
export function syncInternalEdgeBounds(nodes: Node[], edges: Edge[]): Edge[] {
  const bounds = boundaryFlowBounds(nodes)
  if (!bounds) return edges
  return edges.map((edge) => {
    const data = (edge.data || {}) as { internal?: boolean; parentBounds?: FlowBounds }
    if (!data?.internal && !data?.parentBounds) return edge
    return {
      ...edge,
      data: {
        ...edge.data,
        parentBounds: bounds,
      },
    }
  })
}

export function findNodeIdForPort(nodes: Node[], portId: string): string | null {
  for (const node of nodes) {
    const ports = ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
    if (ports.some((p) => p.id === portId)) return node.id
  }
  return null
}

function edgeRoutingKind(edge: Edge): string {
  return ((edge.data || {}) as { routing?: string }).routing || 'angular'
}

function polylineFromExisting(
  nodes: Node[],
  edge: Edge,
  portLayout: PortLayout | undefined,
  existingWaypoints: Pt[] | undefined,
): { id: string; points: Pt[]; sourcePort: string; targetPort: string } | null {
  if (edgeRoutingKind(edge) !== 'angular') return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const srcNode = byId.get(edge.source)
  const tgtNode = byId.get(edge.target)
  if (!srcNode || !tgtNode) return null

  const srcPortId = portIdFromHandle(edge.sourceHandle)
  const tgtPortId = portIdFromHandle(edge.targetHandle)
  const srcPort = portsOf(srcNode).find((p) => p.id === srcPortId)
  const tgtPort = portsOf(tgtNode).find((p) => p.id === tgtPortId)
  if (!srcPort || !tgtPort || !srcPortId || !tgtPortId) return null

  const srcRect = nodeRect(srcNode, byId)
  const tgtRect = nodeRect(tgtNode, byId)
  const src = resolvePort(srcPort, portLayout)
  const tgt = resolvePort(tgtPort, portLayout)
  const start = portPoint(srcRect, src.side, src.offset)
  const end = portPoint(tgtRect, tgt.side, tgt.offset)
  const wps = existingWaypoints || []
  const points = resolveRoutePoints(start.x, start.y, end.x, end.y, wps)
  return {
    id: edge.id,
    points,
    sourcePort: srcPortId,
    targetPort: tgtPortId,
  }
}

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function portPoint(rect: Rect, side: PortSide, offset: number): Pt {
  const o = Math.min(0.95, Math.max(0.05, offset))
  switch (side) {
    case 'left':
      return { x: rect.minX, y: rect.minY + o * (rect.maxY - rect.minY) }
    case 'right':
      return { x: rect.maxX, y: rect.minY + o * (rect.maxY - rect.minY) }
    case 'top':
      return { x: rect.minX + o * (rect.maxX - rect.minX), y: rect.minY }
    case 'bottom':
      return { x: rect.minX + o * (rect.maxX - rect.minX), y: rect.maxY }
  }
}

function stubPoint(pt: Pt, side: PortSide, inward: boolean): Pt {
  const sign = inward ? 1 : -1
  switch (side) {
    case 'left':
      return { x: pt.x + sign * STUB_LEN, y: pt.y }
    case 'right':
      return { x: pt.x - sign * STUB_LEN, y: pt.y }
    case 'top':
      return { x: pt.x, y: pt.y + sign * STUB_LEN }
    case 'bottom':
      return { x: pt.x, y: pt.y - sign * STUB_LEN }
  }
}

function unionRects(rects: Rect[], margin: number): Rect | null {
  if (!rects.length) return null
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
  return {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  }
}

export type PortLayout = Record<
  string,
  { side?: PortSide | null; offset?: number | null }
>

function resolvePort(
  port: PartPort,
  layout?: PortLayout,
): { side: PortSide; offset: number } {
  // Prefer live node port data (matches rendered handles); viz is fallback only.
  const viz = layout?.[port.id]
  return {
    side: port.side || viz?.side || 'right',
    offset: port.offset ?? viz?.offset ?? 0.5,
  }
}

/**
 * Re-route structure/whitebox connections from the current node and port
 * placement. Does not move parts or ports.
 *
 * Only *locked* waypoints are kept; all other stored corners are discarded
 * and recomputed (avoids stale segments after port moves).
 */
export function redrawStructureConnections(
  nodes: Node[],
  edges: Edge[],
  portLayout?: PortLayout,
  existingRoutes?: ExistingEdgeRoute[],
  options?: RedrawOptions,
): RoutedConnection[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parts = nodes.filter((n) => n.type === 'part' || !n.type)
  const boundary = parts.find(isBoundary)
  const rects = new Map<string, Rect>()
  for (const n of parts) rects.set(n.id, nodeRect(n, byId))

  const bounds =
    (boundary && rects.get(boundary.id)) ||
    unionRects([...rects.values()], 48) || {
      minX: 0,
      minY: 0,
      maxX: 800,
      maxY: 600,
    }

  const childRects = parts
    .filter((n) => n.id !== boundary?.id)
    .map((n) => rects.get(n.id)!)

  const existingById = new Map(
    (existingRoutes || []).map((r) => [r.id, r.waypoints || []]),
  )
  const contextEdges = options?.contextEdges ?? edges
  const rerouteIds = new Set(edges.map((e) => e.id))
  const lockedById = new Map<string, Pt[]>()
  for (const edge of contextEdges) {
    if (edgeRoutingKind(edge) !== 'angular') continue
    lockedById.set(
      edge.id,
      (existingById.get(edge.id) || []).filter((w) => w.locked),
    )
  }

  type Draft = {
    id: string
    points: Pt[]
    sourcePort: string
    targetPort: string
    locked: Pt[]
    obstacles: Rect[]
  }
  const drafts: Draft[] = []

  for (const edge of edges) {
    const srcNode = byId.get(edge.source)
    const tgtNode = byId.get(edge.target)
    if (!srcNode || !tgtNode) continue

    const srcPortId = portIdFromHandle(edge.sourceHandle)
    const tgtPortId = portIdFromHandle(edge.targetHandle)
    const srcPort = portsOf(srcNode).find((p) => p.id === srcPortId)
    const tgtPort = portsOf(tgtNode).find((p) => p.id === tgtPortId)
    if (!srcPort || !tgtPort || !srcPortId || !tgtPortId) continue

    const srcRect = rects.get(srcNode.id)
    const tgtRect = rects.get(tgtNode.id)
    if (!srcRect || !tgtRect) continue

    const src = resolvePort(srcPort, portLayout)
    const tgt = resolvePort(tgtPort, portLayout)
    const start = portPoint(srcRect, src.side, src.offset)
    const end = portPoint(tgtRect, tgt.side, tgt.offset)
    const srcStub = stubPoint(start, src.side, isBoundary(srcNode))
    const tgtStub = stubPoint(end, tgt.side, isBoundary(tgtNode))

    const obstacles = childRects.filter((r) => r !== srcRect && r !== tgtRect)
    if (!isBoundary(srcNode)) obstacles.push(srcRect)
    if (!isBoundary(tgtNode) && tgtRect !== srcRect) obstacles.push(tgtRect)

    // Only locked vias survive redraw — unlock everything else.
    const locked = (existingById.get(edge.id) || []).filter((w) => w.locked)
    const waypoints = routeWithLockedVia(
      start,
      srcStub,
      tgtStub,
      end,
      locked,
      obstacles,
      bounds,
    )
    const full = simplifyOrtho([
      start,
      ...waypoints.map((w) => ({ x: w.x, y: w.y })),
      end,
    ])
    drafts.push({
      id: edge.id,
      points: full,
      sourcePort: srcPortId,
      targetPort: tgtPortId,
      locked,
      obstacles,
    })
  }

  const staticRoutes: {
    id: string
    points: Pt[]
    sourcePort: string
    targetPort: string
  }[] = []
  for (const edge of contextEdges) {
    if (rerouteIds.has(edge.id)) continue
    const poly = polylineFromExisting(
      nodes,
      edge,
      portLayout,
      existingById.get(edge.id),
    )
    if (poly) staticRoutes.push(poly)
  }

  const separation = options?.separation ?? 5

  let separated = separateUnrelatedRoutes(
    [
      ...drafts.map((d) => ({
        id: d.id,
        points: d.points,
        sourcePort: d.sourcePort,
        targetPort: d.targetPort,
      })),
      ...staticRoutes,
    ],
    separation,
  )

  // Separation must never push a wire through a part — re-route if it did,
  // preserving locked vias (only for freshly routed edges).
  separated = separated.map((r) => {
    const draft = drafts.find((d) => d.id === r.id)
    if (!draft) return r
    if (!pathCrossesObstaclesMid(r.points, draft.obstacles)) return r
    const start = draft.points[0]
    const end = draft.points[draft.points.length - 1]
    const srcStub = r.points.length > 2 ? r.points[1] : start
    const tgtStub =
      r.points.length > 2 ? r.points[r.points.length - 2] : end
    // Prefer stubs from the original draft path (index 1 / -2 after start/end).
    const dStart = draft.points[0]
    const dEnd = draft.points[draft.points.length - 1]
    const dSrcStub =
      draft.points.length > 2 ? draft.points[1] : dStart
    const dTgtStub =
      draft.points.length > 2
        ? draft.points[draft.points.length - 2]
        : dEnd
    void srcStub
    void tgtStub
    const waypoints = routeWithLockedVia(
      dStart,
      dSrcStub,
      dTgtStub,
      dEnd,
      draft.locked,
      draft.obstacles,
      bounds,
    )
    return {
      ...r,
      points: simplifyOrtho([
        dStart,
        ...waypoints.map((w) => ({ x: w.x, y: w.y })),
        dEnd,
      ]),
    }
  })

  // Final guarantee: every returned route clears parts (still keep locked vias).
  // Use full mid-check (includes short L-routes), not only long polylines.
  for (const r of separated) {
    const draft = drafts.find((d) => d.id === r.id)
    if (!draft) continue
    if (!pathCrossesObstaclesMid(r.points, draft.obstacles)) continue
    const dStart = draft.points[0]
    const dEnd = draft.points[draft.points.length - 1]
    const dSrcStub =
      draft.points.length > 2 ? draft.points[1] : dStart
    const dTgtStub =
      draft.points.length > 2
        ? draft.points[draft.points.length - 2]
        : dEnd
    const waypoints = routeWithLockedVia(
      dStart,
      dSrcStub,
      dTgtStub,
      dEnd,
      draft.locked,
      draft.obstacles,
      bounds,
    )
    r.points = simplifyOrtho([
      dStart,
      ...waypoints.map((w) => ({ x: w.x, y: w.y })),
      dEnd,
    ])
  }

  const jumpsById = computeJumpers(separated)

  const contextAngularIds = new Set(
    contextEdges.filter((e) => edgeRoutingKind(e) === 'angular').map((e) => e.id),
  )

  return separated
    .filter((r) => contextAngularIds.has(r.id))
    .map((r) => {
      const corners = cornersFromFull(r.points)
      return {
        id: r.id,
        waypoints: markLockedWaypoints(corners, lockedById.get(r.id) || []),
        jumps: jumpsById.get(r.id) || [],
      }
    })
}

/** Route start→end, forcing locked via-points to stay (in order). */
export function routeWithLockedVia(
  start: Pt,
  srcStub: Pt,
  tgtStub: Pt,
  end: Pt,
  locked: Pt[],
  obstacles: Rect[],
  bounds: Rect,
): Pt[] {
  if (!locked.length) {
    const inner = routeOrthogonal(srcStub, tgtStub, obstacles, bounds)
    const full = simplifyOrtho([start, ...inner, end])
    return full.length <= 2 ? [] : full.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
  }

  const anchors: Pt[] = [srcStub, ...locked.map((p) => ({ x: p.x, y: p.y })), tgtStub]
  const assembled: Pt[] = [start]
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]
    const b = anchors[i]
    const seg = routeOrthogonal(a, b, obstacles, bounds)
    // Drop duplicate join point
    assembled.push(...seg.slice(1))
  }
  assembled.push(end)
  const full = simplifyOrtho(assembled)
  const corners =
    full.length <= 2 ? [] : full.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))

  // Re-apply locked flags to nearest matching corners
  return markLockedWaypoints(corners, locked)
}

export function markLockedWaypoints(waypoints: Pt[], locked: Pt[]): Pt[] {
  if (!locked.length) return waypoints.map((w) => ({ x: w.x, y: w.y }))
  const used = new Set<number>()
  return waypoints.map((w) => {
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < locked.length; i++) {
      if (used.has(i)) continue
      const d = Math.hypot(w.x - locked[i].x, w.y - locked[i].y)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    if (best >= 0 && bestDist < 2.5) {
      used.add(best)
      return { x: locked[best].x, y: locked[best].y, locked: true }
    }
    return { x: w.x, y: w.y }
  })
}

/**
 * Recompute waypoints around obstacles (A* / escapes). Used by Redraw and
 * tests — not from edge render (too expensive for pan/zoom frames).
 */
export function resolveObstacleAwareWaypoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  waypoints: Pt[],
  obstacles: Rect[],
  bounds: Rect,
): Pt[] {
  const locked = waypoints.filter((w) => w.locked)
  const start = { x: sx, y: sy }
  const end = { x: tx, y: ty }
  // Prefer current corners when the full polyline already clears obstacles.
  if (waypoints.length) {
    const asCorners = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
    let ortho = true
    for (let i = 1; i < asCorners.length; i++) {
      const p = asCorners[i - 1]
      const q = asCorners[i]
      if (!nearlyEq(p.x, q.x) && !nearlyEq(p.y, q.y)) {
        ortho = false
        break
      }
    }
    if (ortho && !pathCrossesObstaclesMid(asCorners, obstacles)) {
      return waypoints.map((w) => ({ ...w }))
    }
  }

  const srcStub = { x: sx, y: sy }
  const tgtStub = { x: tx, y: ty }
  return routeWithLockedVia(
    start,
    srcStub,
    tgtStub,
    end,
    locked,
    obstacles,
    bounds,
  )
}
