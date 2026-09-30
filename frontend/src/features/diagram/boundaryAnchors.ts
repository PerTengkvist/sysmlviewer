import type { PortSide } from '../../api'

/** One connection point on a use-case ellipse or requirement boundary. */
export type BoundaryAnchor = {
  id: string
  side: PortSide
  /** 0..1 along that side of the node box. */
  offset: number
}

export const DEFAULT_BOUNDARY_ANCHORS: BoundaryAnchor[] = [
  { id: 'a-left', side: 'left', offset: 0.5 },
  { id: 'a-right', side: 'right', offset: 0.5 },
  { id: 'a-top', side: 'top', offset: 0.5 },
  { id: 'a-bottom', side: 'bottom', offset: 0.5 },
]

const SIDES = new Set<PortSide>(['left', 'right', 'top', 'bottom'])

function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0.5
  return Math.min(0.95, Math.max(0.05, offset))
}

/** Saved anchors override the four defaults; unknown ids are extra points. */
export function resolveAnchors(
  saved: BoundaryAnchor[] | null | undefined,
): BoundaryAnchor[] {
  const defaults = DEFAULT_BOUNDARY_ANCHORS.map((a) => ({ ...a }))
  if (!saved?.length) return defaults
  const byId = new Map(defaults.map((a) => [a.id, a]))
  const extras: BoundaryAnchor[] = []
  for (const raw of saved) {
    if (!raw?.id || !SIDES.has(raw.side)) continue
    const anchor: BoundaryAnchor = {
      id: raw.id,
      side: raw.side,
      offset: clampOffset(Number(raw.offset)),
    }
    if (byId.has(raw.id)) byId.set(raw.id, anchor)
    else extras.push(anchor)
  }
  return [...byId.values(), ...extras]
}

export function anchorOnSide(
  anchors: BoundaryAnchor[],
  side: PortSide,
  offset?: number | null,
): BoundaryAnchor {
  const onSide = anchors.filter((a) => a.side === side)
  const target = offset ?? 0.5
  if (!onSide.length) {
    return (
      anchors.find((a) => a.id === `a-${side}`) || {
        id: `a-${side}`,
        side,
        offset: clampOffset(target),
      }
    )
  }
  return onSide.reduce((best, a) =>
    Math.abs(a.offset - target) < Math.abs(best.offset - target) ? a : best,
  )
}

/**
 * Bind an edge end to a stored anchor id when it still exists, otherwise the
 * closest point on the requested side (following a point that slid off that side).
 */
export function bindStoredAnchor(
  anchors: BoundaryAnchor[],
  side: PortSide | undefined,
  offset: number | undefined,
  anchorId?: string | null,
): BoundaryAnchor {
  if (anchorId) {
    const found = anchors.find((a) => a.id === anchorId)
    if (found) return found
  }
  return anchorOnSide(anchors, side || 'right', offset)
}

/** Handle position. Ellipses project the side offset onto the inscribed curve. */
export function anchorHandleStyle(
  side: PortSide,
  offset: number,
  shape: 'ellipse' | 'rect',
): { left: string; top: string; transform: string } {
  const t = clampOffset(offset)
  if (shape === 'rect') {
    if (side === 'left' || side === 'right') {
      return {
        left: side === 'left' ? '0%' : '100%',
        top: `${t * 100}%`,
        transform: 'translate(-50%, -50%)',
      }
    }
    return {
      left: `${t * 100}%`,
      top: side === 'top' ? '0%' : '100%',
      transform: 'translate(-50%, -50%)',
    }
  }
  let px = 0.5
  let py = 0.5
  if (side === 'left') {
    px = 0
    py = t
  } else if (side === 'right') {
    px = 1
    py = t
  } else if (side === 'top') {
    px = t
    py = 0
  } else {
    px = t
    py = 1
  }
  const vx = px - 0.5
  const vy = py - 0.5
  const len = Math.hypot(vx, vy) || 1
  const s = 0.5 / len
  return {
    left: `${(0.5 + vx * s) * 100}%`,
    top: `${(0.5 + vy * s) * 100}%`,
    transform: 'translate(-50%, -50%)',
  }
}
