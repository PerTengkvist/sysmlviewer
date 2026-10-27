/**
 * Shared "which side should a port face" helpers used by every placement
 * pipeline, so the port placement mode is honoured the same way everywhere.
 */
import type { PortSide } from '../../../api'

export type Vec = { x: number; y: number }

const SIDE_NORMAL: Record<PortSide, Vec> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/**
 * The allowed side whose outward normal best matches `vector` (max dot
 * product; first allowed side wins ties). With a zero vector the current
 * side is kept when allowed, else the first allowed side.
 */
export function chooseSideAmong(
  allowed: readonly PortSide[],
  vector: Vec,
  current?: PortSide,
): PortSide {
  if (!allowed.length) return current ?? 'right'
  if (vector.x === 0 && vector.y === 0) {
    return current && allowed.includes(current) ? current : allowed[0]
  }
  let best = allowed[0]
  let bestDot = Number.NEGATIVE_INFINITY
  for (const side of allowed) {
    const n = SIDE_NORMAL[side]
    const dot = n.x * vector.x + n.y * vector.y
    if (dot > bestDot + 1e-9) {
      bestDot = dot
      best = side
    }
  }
  return best
}

export type PeerLink = {
  sourcePart: string
  targetPart: string
  sourcePort: string
  targetPort: string
}

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * Sum of centre-to-centre vectors from the owner part to every peer the port
 * is linked to. `rectOf` resolves part rectangles (absolute or same frame);
 * `pointOfPort` may resolve a peer port directly (boundary ports), taking
 * precedence over the peer part rectangle.
 */
export function peerVectorForPort(
  portId: string,
  ownerId: string,
  links: readonly PeerLink[],
  rectOf: (partId: string) => Rect | null,
  pointOfPort?: (portId: string) => Vec | null,
): { x: number; y: number; n: number } {
  const own = rectOf(ownerId)
  if (!own) return { x: 0, y: 0, n: 0 }
  const ox = own.x + own.width / 2
  const oy = own.y + own.height / 2
  let x = 0
  let y = 0
  let n = 0
  for (const l of links) {
    if (l.sourcePort !== portId && l.targetPort !== portId) continue
    const peerPart = l.sourcePort === portId ? l.targetPart : l.sourcePart
    const peerPort = l.sourcePort === portId ? l.targetPort : l.sourcePort
    if (peerPart === ownerId) continue
    const pt = pointOfPort?.(peerPort) ?? null
    if (pt) {
      x += pt.x - ox
      y += pt.y - oy
      n += 1
      continue
    }
    const r = rectOf(peerPart)
    if (!r) continue
    x += r.x + r.width / 2 - ox
    y += r.y + r.height / 2 - oy
    n += 1
  }
  return { x, y, n }
}
