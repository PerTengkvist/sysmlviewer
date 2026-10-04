/**
 * Default / safe port placement: keep L/R ports in the part *body*
 * (below the header) so labels do not cover «part» / title text.
 */
import type { PortSide } from '../../../api'

/** Approximate header height (stereotypes + title + padding). */
export const PART_HEADER_PX = 48

export const PORT_BODY_OFFSET_MAX = 0.95
export const PORT_BODY_OFFSET_MIN_FLOOR = 0.05
export const PORT_BODY_OFFSET_MIN_CEIL = 0.45
export const PORT_BOUNDARY_OFFSET_MIN = 0.02
export const PORT_BOUNDARY_OFFSET_MAX = 0.98
export const PORT_TB_INSET = 0.05

export type ClampPortOpts = {
  isBoundary?: boolean
}

export function bodyOffsetMin(partHeight: number): number {
  const h = Math.max(partHeight, PART_HEADER_PX + 24)
  const raw = PART_HEADER_PX / h
  return Math.min(PORT_BODY_OFFSET_MIN_CEIL, Math.max(PORT_BODY_OFFSET_MIN_FLOOR, raw))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Convert zoomed screen box size to flow coordinates. */
export function flowSizeFromScreenRect(
  screenW: number,
  screenH: number,
  zoom: number,
): { width: number; height: number } {
  const z = zoom === 0 || !Number.isFinite(zoom) ? 1 : zoom
  return { width: screenW / z, height: screenH / z }
}

/** Evenly pack `count` ports along the body band of a vertical edge. */
export function packBodyOffsets(
  count: number,
  partHeight = 120,
): number[] {
  if (count <= 0) return []
  const lo = bodyOffsetMin(partHeight)
  const hi = PORT_BODY_OFFSET_MAX
  if (count === 1) return [(lo + hi) / 2]
  return Array.from({ length: count }, (_, i) => {
    return lo + ((i + 0.5) / count) * (hi - lo)
  })
}

/** Clamp offset so L/R ports stay out of the header; T/B use a mild inset. */
export function clampPortOffset(
  offset: number,
  side: PortSide,
  partHeight = 120,
  opts?: ClampPortOpts,
): number {
  if (side === 'top' || side === 'bottom') {
    return clamp(offset, PORT_TB_INSET, PORT_BODY_OFFSET_MAX)
  }
  if (opts?.isBoundary) {
    return clamp(offset, PORT_BOUNDARY_OFFSET_MIN, PORT_BOUNDARY_OFFSET_MAX)
  }
  return clamp(offset, bodyOffsetMin(partHeight), PORT_BODY_OFFSET_MAX)
}

export function hasSavedPortPlacement(viz: {
  side?: PortSide | string | null
  offset?: number | null
} | null | undefined): boolean {
  return viz != null && viz.side != null && viz.offset != null
}
