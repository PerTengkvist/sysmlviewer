import type { PortSide } from '../../../../api'

export type Box = { x: number; y: number; width: number; height: number }

function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0.5
  return Math.min(0.95, Math.max(0.05, offset))
}

/**
 * Where the centre→centre segment exits `box` (axis-aligned). That hit is the
 * nearest boundary attachment for a straight relation toward `peer`.
 */
export function shortestBoundaryHit(
  box: Box,
  peer: Box,
): { side: PortSide; offset: number } {
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const to = { x: peer.x + peer.width / 2, y: peer.y + peer.height / 2 }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const hw = box.width / 2
  const hh = box.height / 2
  if (hw < 1e-6 || hh < 1e-6) {
    return { side: 'right', offset: 0.5 }
  }
  const tx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY
  const ty = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY
  if (tx <= ty) {
    const side: PortSide = dx >= 0 ? 'right' : 'left'
    const y = from.y + dy * tx
    return { side, offset: clampOffset((y - box.y) / box.height) }
  }
  const side: PortSide = dy >= 0 ? 'bottom' : 'top'
  const x = from.x + dx * ty
  return { side, offset: clampOffset((x - box.x) / box.width) }
}
