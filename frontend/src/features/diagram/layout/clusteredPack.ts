/**
 * Clustered composition (N ≥ 4): a small, dense core of parts in the middle
 * and the remaining parts packed in rectangular rings around it, with
 * channels wide enough for the connections that cross between rings.
 *
 * Replaces the single-ring "onion" that put one hub in the centre and every
 * other part on one large circle.
 */

export type PackBox = { id: string; w: number; h: number }
export type PackEdge = { source: string; target: string }

export type PackPlacement = {
  x: number
  y: number
  width: number
  height: number
}

export type ClusterPackOptions = {
  /** Gap between neighbours as a fraction of box size (0.15–0.25). */
  gapFraction: number
  /** Minimum channel width between core and ring / ring and ring. */
  minChannel: number
  /** Width reserved per connection crossing a channel. Default 12. */
  separation?: number
}

export type ClusterPackResult = {
  children: Record<string, PackPlacement>
  parentWidth: number
  parentHeight: number
  strategy: 'cluster-pack'
  core: string[]
  rings: string[][]
}

type Side = 'top' | 'right' | 'bottom' | 'left'
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

type Rect = { minX: number; minY: number; maxX: number; maxY: number }

export function coreSizeFor(n: number): number {
  if (n < 4) return 1
  return Math.max(1, Math.min(4, Math.round(n / 3)))
}

function degreeMap(ids: string[], edges: PackEdge[]): Map<string, number> {
  const set = new Set(ids)
  const deg = new Map<string, number>()
  for (const id of ids) deg.set(id, 0)
  for (const e of edges) {
    if (!set.has(e.source) || !set.has(e.target) || e.source === e.target) continue
    deg.set(e.source, (deg.get(e.source) || 0) + 1)
    deg.set(e.target, (deg.get(e.target) || 0) + 1)
  }
  return deg
}

function edgesBetween(
  id: string,
  group: Set<string>,
  edges: PackEdge[],
): number {
  let n = 0
  for (const e of edges) {
    if (e.source === id && group.has(e.target)) n += 1
    else if (e.target === id && group.has(e.source)) n += 1
  }
  return n
}

/** Greedy densest core: hub first, then the neighbour with most edges into the core. */
export function chooseCore(
  boxes: PackBox[],
  edges: PackEdge[],
  size: number,
): string[] {
  const ids = boxes.map((b) => b.id)
  const deg = degreeMap(ids, edges)
  const byDegree = [...ids].sort((a, b) => {
    const d = (deg.get(b) || 0) - (deg.get(a) || 0)
    return d !== 0 ? d : a.localeCompare(b)
  })
  const core = new Set<string>()
  if (!byDegree.length) return []
  core.add(byDegree[0])
  while (core.size < Math.min(size, ids.length)) {
    let best: string | undefined
    let bestScore = -1
    for (const id of byDegree) {
      if (core.has(id)) continue
      const into = edgesBetween(id, core, edges)
      const score = into * 1000 + (deg.get(id) || 0)
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }
    if (!best) break
    core.add(best)
  }
  return [...core].sort()
}

function boundsOf(rects: Rect[]): Rect {
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    minY: Math.min(...rects.map((r) => r.minY)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    maxY: Math.max(...rects.map((r) => r.maxY)),
  }
}

/** Angle (radians, −π..π) from `from` to `to`; 0 = right, −π/2 = up. */
function angleBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function sideForAngle(angle: number): Side {
  const deg = (angle * 180) / Math.PI
  if (deg >= -45 && deg < 45) return 'right'
  if (deg >= 45 && deg < 135) return 'bottom'
  if (deg >= -135 && deg < -45) return 'top'
  return 'left'
}

function adjacentSides(side: Side): Side[] {
  const i = SIDES.indexOf(side)
  return [SIDES[(i + 1) % 4], SIDES[(i + 3) % 4], SIDES[(i + 2) % 4]]
}

type Satellite = {
  box: PackBox
  angle: number | null
  /** Barycentre of connected core members (absolute, pre-normalisation). */
  anchor: { x: number; y: number } | null
  degree: number
}

type RingRow = { side: Side; items: Satellite[]; length: number }

function sideLength(ring: Rect, side: Side): number {
  return side === 'top' || side === 'bottom'
    ? ring.maxX - ring.minX
    : ring.maxY - ring.minY
}

function alongOf(side: Side, box: PackBox): number {
  return side === 'top' || side === 'bottom' ? box.w : box.h
}

/**
 * Lay out a row of boxes along a ring side. Each box wants to sit at the
 * projection of its anchor onto the side; boxes are then packed left→right
 * (top→bottom) so they never overlap and stay within the side's extent.
 */
function placeRow(
  ring: Rect,
  side: Side,
  items: Satellite[],
  gap: number,
  out: Record<string, PackPlacement>,
): void {
  const horizontal = side === 'top' || side === 'bottom'
  const min = horizontal ? ring.minX : ring.minY
  const max = horizontal ? ring.maxX : ring.maxY
  const centre = (min + max) / 2
  const desired = (it: Satellite): number => {
    const size = alongOf(side, it.box)
    const a = it.anchor
    const want = a ? (horizontal ? a.x : a.y) : centre
    return want - size / 2
  }
  const ordered = [...items].sort((a, b) => {
    const d = desired(a) - desired(b)
    return d !== 0 ? d : a.box.id.localeCompare(b.box.id)
  })
  // Forward pack from desired positions.
  const starts: number[] = []
  let cursor = Number.NEGATIVE_INFINITY
  for (const it of ordered) {
    const start = Math.max(desired(it), cursor, min)
    starts.push(start)
    cursor = start + alongOf(side, it.box) + gap
  }
  // Keep inside the side: shift back if the row runs past `max`.
  const end = cursor - gap
  if (end > max) {
    const shift = Math.min(end - max, starts[0] - min)
    for (let i = 0; i < starts.length; i++) starts[i] -= shift
  }
  ordered.forEach((it, i) => {
    const { w, h } = it.box
    if (horizontal) {
      const y = side === 'top' ? ring.minY - h : ring.maxY
      out[it.box.id] = { x: starts[i], y, width: w, height: h }
    } else {
      const x = side === 'left' ? ring.minX - w : ring.maxX
      out[it.box.id] = { x, y: starts[i], width: w, height: h }
    }
  })
}

function crossingEdges(
  inner: Set<string>,
  outer: Set<string>,
  edges: PackEdge[],
): number {
  let n = 0
  for (const e of edges) {
    const a = inner.has(e.source) && outer.has(e.target)
    const b = inner.has(e.target) && outer.has(e.source)
    if (a || b) n += 1
  }
  return n
}

/**
 * Pack `boxes` around a dense core. Coordinates are relative to the
 * returned parent box (origin top-left, padded by `gap`).
 */
export function packAroundCore(
  boxes: PackBox[],
  edges: PackEdge[],
  opts: ClusterPackOptions,
  placeCore?: (
    core: PackBox[],
    coreEdges: PackEdge[],
  ) => { children: Record<string, PackPlacement> },
): ClusterPackResult {
  const n = boxes.length
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const avgW = boxes.reduce((s, b) => s + b.w, 0) / Math.max(n, 1)
  const avgH = boxes.reduce((s, b) => s + b.h, 0) / Math.max(n, 1)
  const gap = Math.max(avgW, avgH) * opts.gapFraction
  const separation = opts.separation ?? 12

  const coreIds = chooseCore(boxes, edges, coreSizeFor(n))
  const coreSet = new Set(coreIds)
  const coreBoxes = coreIds.map((id) => byId.get(id)!)
  const coreEdges = edges.filter(
    (e) => coreSet.has(e.source) && coreSet.has(e.target),
  )

  const children: Record<string, PackPlacement> = {}
  const corePlaced = placeCore
    ? placeCore(coreBoxes, coreEdges)
    : defaultCorePlacement(coreBoxes, gap)
  for (const id of coreIds) {
    const c = corePlaced.children[id]
    children[id] = { x: c.x, y: c.y, width: c.width, height: c.height }
  }
  const deg = degreeMap(
    boxes.map((b) => b.id),
    edges,
  )

  let inner: Rect = boundsOf(
    coreIds.map((id) => {
      const c = children[id]
      return {
        minX: c.x,
        minY: c.y,
        maxX: c.x + c.width,
        maxY: c.y + c.height,
      }
    }),
  )
  const coreCentre = {
    x: (inner.minX + inner.maxX) / 2,
    y: (inner.minY + inner.maxY) / 2,
  }

  // Satellite anchors: barycentre of connected core members (if any).
  const satellites: Satellite[] = boxes
    .filter((b) => !coreSet.has(b.id))
    .map((b) => {
      const targets: { x: number; y: number }[] = []
      for (const e of edges) {
        const other =
          e.source === b.id ? e.target : e.target === b.id ? e.source : null
        if (!other || !coreSet.has(other)) continue
        const c = children[other]
        targets.push({ x: c.x + c.width / 2, y: c.y + c.height / 2 })
      }
      let angle: number | null = null
      let anchor: { x: number; y: number } | null = null
      if (targets.length) {
        const bx = targets.reduce((s, t) => s + t.x, 0) / targets.length
        const by = targets.reduce((s, t) => s + t.y, 0) / targets.length
        anchor = { x: bx, y: by }
        const d = Math.hypot(bx - coreCentre.x, by - coreCentre.y)
        angle =
          d < 1e-6
            ? -Math.PI / 2 + (edges.length % 4) * (Math.PI / 2)
            : angleBetween(coreCentre, { x: bx, y: by })
      }
      return { box: b, angle, anchor, degree: deg.get(b.id) || 0 }
    })
    .sort((a, b) => {
      if (a.angle == null && b.angle != null) return 1
      if (a.angle != null && b.angle == null) return -1
      if (a.angle != null && b.angle != null && a.angle !== b.angle) {
        return a.angle - b.angle
      }
      if (b.degree !== a.degree) return b.degree - a.degree
      return a.box.id.localeCompare(b.box.id)
    })

  const rings: string[][] = []
  let placedSet = new Set(coreIds)
  let pending = satellites
  let guard = 0
  while (pending.length && guard++ < 50) {
    const remainingSet = new Set(pending.map((s) => s.box.id))
    const crossing = crossingEdges(placedSet, remainingSet, edges)
    // Connections spread over the four sides of the ring.
    const channel = Math.max(
      opts.minChannel,
      Math.ceil(crossing / 4) * separation + 2 * 8,
    )
    const ring: Rect = {
      minX: inner.minX - channel,
      minY: inner.minY - channel,
      maxX: inner.maxX + channel,
      maxY: inner.maxY + channel,
    }
    const rows: Record<Side, RingRow> = {
      top: { side: 'top', items: [], length: 0 },
      right: { side: 'right', items: [], length: 0 },
      bottom: { side: 'bottom', items: [], length: 0 },
      left: { side: 'left', items: [], length: 0 },
    }
    const overflow: Satellite[] = []
    const unanchored: Satellite[] = []
    const tryPlace = (sat: Satellite, side: Side): boolean => {
      const row = rows[side]
      const add = alongOf(side, sat.box) + (row.items.length ? gap : 0)
      if (row.length + add > sideLength(ring, side) + 1e-6) return false
      row.items.push(sat)
      row.length += add
      return true
    }
    for (const sat of pending) {
      if (sat.angle == null) {
        unanchored.push(sat)
        continue
      }
      const preferred = sideForAngle(sat.angle)
      let ok = tryPlace(sat, preferred)
      if (!ok) {
        for (const side of adjacentSides(preferred)) {
          if (tryPlace(sat, side)) {
            ok = true
            break
          }
        }
      }
      if (!ok) overflow.push(sat)
    }
    // Unanchored parts fill the emptiest sides first.
    for (const sat of unanchored) {
      const order = [...SIDES].sort(
        (a, b) =>
          rows[a].length / sideLength(ring, a) -
          rows[b].length / sideLength(ring, b),
      )
      let ok = false
      for (const side of order) {
        if (tryPlace(sat, side)) {
          ok = true
          break
        }
      }
      if (!ok) overflow.push(sat)
    }

    const placedThisRing: string[] = []
    for (const side of SIDES) {
      const row = rows[side]
      if (!row.items.length) continue
      placeRow(ring, side, row.items, gap, children)
      for (const it of row.items) placedThisRing.push(it.box.id)
    }
    if (!placedThisRing.length) {
      // Ring too small for even one box: grow the ring and retry.
      inner = {
        minX: inner.minX - avgW,
        minY: inner.minY - avgH,
        maxX: inner.maxX + avgW,
        maxY: inner.maxY + avgH,
      }
      continue
    }
    rings.push(placedThisRing.sort())
    placedSet = new Set([...placedSet, ...placedThisRing])
    inner = boundsOf(
      [...placedSet].map((id) => {
        const c = children[id]
        return {
          minX: c.x,
          minY: c.y,
          maxX: c.x + c.width,
          maxY: c.y + c.height,
        }
      }),
    )
    pending = overflow
  }

  // Normalise to a padded origin.
  const all = boundsOf(
    Object.values(children).map((c) => ({
      minX: c.x,
      minY: c.y,
      maxX: c.x + c.width,
      maxY: c.y + c.height,
    })),
  )
  const pad = gap
  for (const id of Object.keys(children)) {
    const c = children[id]
    children[id] = {
      x: c.x - all.minX + pad,
      y: c.y - all.minY + pad,
      width: c.width,
      height: c.height,
    }
  }
  return {
    children,
    parentWidth: all.maxX - all.minX + 2 * pad,
    parentHeight: all.maxY - all.minY + 2 * pad,
    strategy: 'cluster-pack',
    core: coreIds,
    rings,
  }
}

/** Minimal core placement when no composition callback is given: one row. */
function defaultCorePlacement(
  core: PackBox[],
  gap: number,
): { children: Record<string, PackPlacement> } {
  const children: Record<string, PackPlacement> = {}
  let x = 0
  const maxH = Math.max(...core.map((b) => b.h), 0)
  for (const b of core) {
    children[b.id] = { x, y: (maxH - b.h) / 2, width: b.w, height: b.h }
    x += b.w + gap
  }
  return { children }
}
