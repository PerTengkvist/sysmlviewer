/**
 * Evenly space selected ports between the two extremes along an axis.
 */
import type { PortSide } from '../../../api'
import { clampPortOffset } from './portPlacement'

export type DistributeAxis = 'horizontal' | 'vertical'

export type DistributablePort = {
  id: string
  side: PortSide
  offset: number
}

export type DistributePartSize = {
  width: number
  height: number
  isBoundary?: boolean
}

/** Position of a port on the part box (flow px from top-left). */
export function portPointOnPart(
  side: PortSide,
  offset: number,
  size: DistributePartSize,
): { x: number; y: number } {
  const w = Math.max(size.width, 1)
  const h = Math.max(size.height, 1)
  const o = Math.min(1, Math.max(0, offset))
  if (side === 'left') return { x: 0, y: o * h }
  if (side === 'right') return { x: w, y: o * h }
  if (side === 'top') return { x: o * w, y: 0 }
  return { x: o * w, y: h }
}

function axisValue(
  side: PortSide,
  offset: number,
  size: DistributePartSize,
  axis: DistributeAxis,
): number {
  const p = portPointOnPart(side, offset, size)
  return axis === 'vertical' ? p.y : p.x
}

/**
 * After moving along an axis, map back onto a border.
 * Prefer keeping the original side when it already faces that axis;
 * otherwise snap to the nearer perpendicular side.
 */
function placementFromAxis(
  original: DistributablePort,
  axisCoord: number,
  size: DistributePartSize,
  axis: DistributeAxis,
): { side: PortSide; offset: number } {
  const w = Math.max(size.width, 1)
  const h = Math.max(size.height, 1)
  const opts = { isBoundary: !!size.isBoundary }

  if (axis === 'vertical') {
    const offset = clampPortOffset(axisCoord / h, 'left', h, opts)
    if (original.side === 'left' || original.side === 'right') {
      return { side: original.side, offset }
    }
    const x = portPointOnPart(original.side, original.offset, size).x
    return { side: x < w / 2 ? 'left' : 'right', offset }
  }

  const offset = clampPortOffset(axisCoord / w, 'top', h, opts)
  if (original.side === 'top' || original.side === 'bottom') {
    return { side: original.side, offset }
  }
  const y = portPointOnPart(original.side, original.offset, size).y
  return { side: y < h / 2 ? 'top' : 'bottom', offset }
}

/**
 * Keep the two extreme ports fixed; redistribute the rest uniformly between them.
 * Returns a patch keyed by port id. No-op when fewer than 2 ports.
 */
export function distributePortPlacements(
  ports: DistributablePort[],
  axis: DistributeAxis,
  size: DistributePartSize,
): Record<string, { side: PortSide; offset: number }> {
  if (ports.length < 2) return {}
  const ranked = ports
    .map((p) => ({
      port: p,
      value: axisValue(p.side, p.offset, size, axis),
    }))
    .sort((a, b) => a.value - b.value || a.port.id.localeCompare(b.port.id))

  const lo = ranked[0]!.value
  const hi = ranked[ranked.length - 1]!.value
  const span = hi - lo
  const n = ranked.length
  const out: Record<string, { side: PortSide; offset: number }> = {}

  for (let i = 0; i < n; i++) {
    const entry = ranked[i]!
    const value = n === 1 ? lo : lo + (span * i) / (n - 1)
    // Extremes keep their side/offset unless span is zero (then still rewrite evenly).
    if (i === 0 || i === n - 1) {
      if (span > 1e-6) {
        out[entry.port.id] = {
          side: entry.port.side,
          offset: entry.port.offset,
        }
        continue
      }
    }
    out[entry.port.id] = placementFromAxis(entry.port, value, size, axis)
  }
  return out
}
