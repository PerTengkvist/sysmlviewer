/**
 * Default / safe port placement: keep L/R ports in the part *body*
 * (below the header) so labels do not cover «part» / title text.
 */
import type { PortSide } from '../../../api'

/** Approximate header height (stereotypes + title + padding). */
export const PART_HEADER_PX = 48

export const PORT_BODY_OFFSET_MAX = 0.92

export function bodyOffsetMin(partHeight: number): number {
  const h = Math.max(partHeight, PART_HEADER_PX + 24)
  return Math.min(0.58, Math.max(0.38, PART_HEADER_PX / h))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
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
): number {
  if (side === 'top' || side === 'bottom') {
    return clamp(offset, 0.08, 0.92)
  }
  return clamp(offset, bodyOffsetMin(partHeight), PORT_BODY_OFFSET_MAX)
}

export function hasSavedPortPlacement(viz: {
  side?: PortSide | string | null
  offset?: number | null
} | null | undefined): boolean {
  return viz != null && viz.side != null && viz.offset != null
}
