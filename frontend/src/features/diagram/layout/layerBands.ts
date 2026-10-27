/**
 * Band geometry for the Layered layout rules: each layer is a row
 * (top-down / bottom-up) or column (left-right / right-left). A band is twice
 * as thick as its largest part (parts take 50 %), parts are centred inside
 * the band, and every row/column is centred on a common axis.
 */
import type { LayerDirection } from '../../../api'
import type { OrderConstraint } from './layoutConstraints'

export type BandBox = { id: string; w: number; h: number }

export type LayerBand = { index: number; start: number; size: number }

export type LayerBandsInput = {
  direction: LayerDirection
  layerCount: number
  layerOf: Map<string, number>
  /** Position within the layer (lower first); missing → by id. */
  order: Map<string, number>
  boxes: BandBox[]
  /** Gap between neighbours inside a band. */
  gap: number
  origin?: { x: number; y: number }
}

export type LayerBandsResult = {
  positions: Record<string, { x: number; y: number }>
  bands: LayerBand[]
  width: number
  height: number
}

export function placeInLayerBands(input: LayerBandsInput): LayerBandsResult {
  const { direction, layerCount, layerOf, order, boxes, gap } = input
  const origin = input.origin ?? { x: 0, y: 0 }
  const vertical = direction === 'top-down' || direction === 'bottom-up'
  const reversed = direction === 'bottom-up' || direction === 'right-left'

  const members: BandBox[][] = Array.from({ length: layerCount }, () => [])
  for (const b of boxes) {
    const li = layerOf.get(b.id)
    if (li == null || li < 0 || li >= layerCount) continue
    members[li].push(b)
  }
  for (const list of members) {
    list.sort((a, b) => {
      const oa = order.get(a.id) ?? Number.POSITIVE_INFINITY
      const ob = order.get(b.id) ?? Number.POSITIVE_INFINITY
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  }

  // Band thickness: 2 × largest extent across the direction; empty → 2 × gap.
  const thickness = members.map((list) => {
    const largest = Math.max(
      0,
      ...list.map((b) => (vertical ? b.h : b.w)),
    )
    return largest > 0 ? largest * 2 : gap * 2
  })
  // Row/column length along the perpendicular axis.
  const length = members.map((list) =>
    list.reduce((s, b) => s + (vertical ? b.w : b.h), 0) +
    gap * Math.max(0, list.length - 1),
  )
  const axisExtent = Math.max(0, ...length)

  // Visual order of bands: reversed directions put layer 0 last.
  const visual = Array.from({ length: layerCount }, (_, i) =>
    reversed ? layerCount - 1 - i : i,
  )
  const bands: LayerBand[] = []
  let cursor = 0
  for (const li of visual) {
    bands[li] = { index: li, start: cursor, size: thickness[li] }
    cursor += thickness[li]
  }
  const total = cursor

  const positions: Record<string, { x: number; y: number }> = {}
  for (let li = 0; li < layerCount; li++) {
    const band = bands[li]
    let along = (axisExtent - length[li]) / 2
    for (const b of members[li]) {
      if (vertical) {
        positions[b.id] = {
          x: origin.x + along,
          y: origin.y + band.start + (band.size - b.h) / 2,
        }
        along += b.w + gap
      } else {
        positions[b.id] = {
          x: origin.x + band.start + (band.size - b.w) / 2,
          y: origin.y + along,
        }
        along += b.h + gap
      }
    }
  }

  return {
    positions,
    bands: bands.map((b) => ({ ...b })),
    width: vertical ? axisExtent : total,
    height: vertical ? total : axisExtent,
  }
}

/**
 * Order parts within each layer: in-layer constraints (topological) first,
 * then a numeric hint (e.g. ELK coordinate), then id. Constraints whose ends
 * are in different layers are ignored.
 */
export function orderWithinLayers(
  layerOf: Map<string, number>,
  orderInLayer: OrderConstraint[],
  hint: Map<string, number>,
): Map<string, number> {
  const byLayer = new Map<number, string[]>()
  for (const [id, li] of layerOf) {
    byLayer.set(li, [...(byLayer.get(li) || []), id])
  }
  const out = new Map<string, number>()
  for (const [li, ids] of byLayer) {
    const idSet = new Set(ids)
    const indeg = new Map<string, number>()
    const adj = new Map<string, string[]>()
    for (const id of ids) {
      indeg.set(id, 0)
      adj.set(id, [])
    }
    const seen = new Set<string>()
    for (const e of orderInLayer) {
      if (!idSet.has(e.before) || !idSet.has(e.after)) continue
      if (layerOf.get(e.before) !== li || layerOf.get(e.after) !== li) continue
      const key = `${e.before}->${e.after}`
      if (seen.has(key)) continue
      seen.add(key)
      adj.get(e.before)!.push(e.after)
      indeg.set(e.after, (indeg.get(e.after) || 0) + 1)
    }
    const cmp = (a: string, b: string) => {
      const ha = hint.get(a) ?? Number.POSITIVE_INFINITY
      const hb = hint.get(b) ?? Number.POSITIVE_INFINITY
      if (ha !== hb) return ha - hb
      return a.localeCompare(b)
    }
    const ready = ids.filter((id) => (indeg.get(id) || 0) === 0).sort(cmp)
    let pos = 0
    const placed = new Set<string>()
    while (ready.length) {
      const u = ready.shift()!
      out.set(u, pos++)
      placed.add(u)
      for (const v of adj.get(u) || []) {
        const d = (indeg.get(v) || 0) - 1
        indeg.set(v, d)
        if (d === 0) {
          ready.push(v)
          ready.sort(cmp)
        }
      }
    }
    // Cycles (should have been rejected as conflicts): append by hint.
    for (const id of [...ids].sort(cmp)) {
      if (!placed.has(id)) out.set(id, pos++)
    }
  }
  return out
}
