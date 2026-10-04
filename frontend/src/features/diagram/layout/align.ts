import type { PortSide, VisualizationNode } from '../../../api'
import {
  bodyOffsetMin,
  clampPortOffset,
  PORT_BODY_OFFSET_MAX,
} from './portPlacement'

export type AlignAxis = 'horizontal' | 'vertical'

export type AlignableNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** Absolute origin of parent; when set, x/y are relative to parent. */
  parentAbs?: { x: number; y: number }
  kind?: 'node' | 'port'
  side?: PortSide | null
  offset?: number | null
}

export type AlignResult = {
  patch: Record<string, Partial<VisualizationNode>>
  skipped: string[]
}

export type PartBox = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type ConnectionPortEnd = {
  id: string
  side: PortSide
  offset: number
}

export type AlignConnectionResult = {
  /** Port side/offset patches keyed by port id. */
  patch: Record<string, Partial<VisualizationNode>>
  possible: boolean
}

/** Align H → sameX (vertical line). Align V → sameY (horizontal line). */
export type ConnectionAlignMode = 'sameX' | 'sameY'

/** Which connection end is the fixed reference (first / source by default). */
export type ConnectionAlignAnchor = 'src' | 'tgt'

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Left/right port body band in absolute Y for a part. */
function lrBodyYRange(part: PartBox): [number, number] {
  const lo = part.y + bodyOffsetMin(part.height) * part.height
  const hi = part.y + PORT_BODY_OFFSET_MAX * part.height
  return [lo, hi]
}

/** Top/bottom port inset band in absolute X for a part. */
function tbBodyXRange(part: PartBox): [number, number] {
  const lo = part.x + 0.08 * part.width
  const hi = part.x + 0.92 * part.width
  return [lo, hi]
}

/** Absolute point of a port on its parent part. */
export function portAbsPoint(
  part: PartBox,
  port: ConnectionPortEnd,
): { x: number; y: number } {
  const { side, offset } = port
  if (side === 'left') {
    return { x: part.x, y: part.y + offset * part.height }
  }
  if (side === 'right') {
    return { x: part.x + part.width, y: part.y + offset * part.height }
  }
  if (side === 'top') {
    return { x: part.x + offset * part.width, y: part.y }
  }
  return { x: part.x + offset * part.width, y: part.y + part.height }
}

/**
 * True when the non-anchor port can be placed to match the anchor on the
 * given mode (same absolute X or Y), without moving the anchor.
 */
export function canAlignDirectConnection(
  mode: ConnectionAlignMode,
  srcPart: PartBox,
  tgtPart: PartBox,
  srcPort: ConnectionPortEnd,
  tgtPort: ConnectionPortEnd,
  anchor: ConnectionAlignAnchor = 'src',
): boolean {
  return alignDirectConnection(
    mode,
    srcPart,
    tgtPart,
    srcPort,
    tgtPort,
    anchor,
  ).possible
}

/**
 * Align the two port ends of a direct connection.
 * The anchor end (default: source / first) never moves; the other end moves
 * to share the anchor's absolute X (sameX / Align H) or Y (sameY / Align V).
 */
export function alignDirectConnection(
  mode: ConnectionAlignMode,
  srcPart: PartBox,
  tgtPart: PartBox,
  srcPort: ConnectionPortEnd,
  tgtPort: ConnectionPortEnd,
  anchor: ConnectionAlignAnchor = 'src',
): AlignConnectionResult {
  const anchorPart = anchor === 'src' ? srcPart : tgtPart
  const movePart = anchor === 'src' ? tgtPart : srcPart
  const movePort = anchor === 'src' ? tgtPort : srcPort
  const anchorPort = anchor === 'src' ? srcPort : tgtPort
  const abs = portAbsPoint(anchorPart, anchorPort)

  if (mode === 'sameY') {
    const [lo, hi] = lrBodyYRange(movePart)
    if (abs.y < lo - 1e-6 || abs.y > hi + 1e-6) {
      return { patch: {}, possible: false }
    }
    const moveCx = movePart.x + movePart.width / 2
    const anchorCx = anchorPart.x + anchorPart.width / 2
    const moveSide: PortSide = moveCx <= anchorCx ? 'right' : 'left'
    const offset = clampPortOffset(
      (abs.y - movePart.y) / Math.max(movePart.height, 1),
      moveSide,
      movePart.height,
    )
    return {
      possible: true,
      patch: {
        [movePort.id]: {
          artifactId: movePort.id,
          side: moveSide,
          offset,
        },
      },
    }
  }

  const [lo, hi] = tbBodyXRange(movePart)
  if (abs.x < lo - 1e-6 || abs.x > hi + 1e-6) {
    return { patch: {}, possible: false }
  }
  const moveCy = movePart.y + movePart.height / 2
  const anchorCy = anchorPart.y + anchorPart.height / 2
  const moveSide: PortSide = moveCy <= anchorCy ? 'bottom' : 'top'
  const offset = clampPortOffset(
    (abs.x - movePart.x) / Math.max(movePart.width, 1),
    moveSide,
    movePart.height,
  )
  return {
    possible: true,
    patch: {
      [movePort.id]: {
        artifactId: movePort.id,
        side: moveSide,
        offset,
      },
    },
  }
}

function absCenter(n: AlignableNode): { cx: number; cy: number } {
  const ox = n.parentAbs?.x ?? 0
  const oy = n.parentAbs?.y ?? 0
  if (n.kind === 'port' && n.side != null && n.offset != null) {
    const off = n.offset
    if (n.side === 'top' || n.side === 'bottom') {
      return { cx: ox + off * n.width, cy: oy + (n.side === 'top' ? 0 : n.height) }
    }
    return { cx: ox + (n.side === 'left' ? 0 : n.width), cy: oy + off * n.height }
  }
  return {
    cx: ox + n.x + n.width / 2,
    cy: oy + n.y + n.height / 2,
  }
}

/**
 * Align selected elements to the first selected (anchor).
 * horizontal → same center Y; vertical → same center X.
 */
export function alignSelection(
  items: AlignableNode[],
  axis: AlignAxis,
  selectedIds: string[],
): AlignResult {
  if (selectedIds.length < 2) return { patch: {}, skipped: [] }
  const byId = new Map(items.map((i) => [i.id, i]))
  const anchorId = selectedIds[0]
  const anchor = byId.get(anchorId)
  if (!anchor) return { patch: {}, skipped: [] }
  const target = absCenter(anchor)
  const patch: Record<string, Partial<VisualizationNode>> = {}
  const skipped: string[] = []

  for (const id of selectedIds.slice(1)) {
    const n = byId.get(id)
    if (!n) continue
    if (n.kind === 'port') {
      const side = n.side
      if (!side) {
        skipped.push(id)
        continue
      }
      if (axis === 'horizontal') {
        // Same center Y → only ports on left/right can change offset
        if (side !== 'left' && side !== 'right') {
          skipped.push(id)
          continue
        }
        const parentH = n.height || 1
        const absY = target.cy
        const parentTop = n.parentAbs?.y ?? 0
        const offset = clamp01((absY - parentTop) / parentH)
        patch[id] = { artifactId: id, side, offset }
      } else {
        // vertical → same center X → top/bottom ports
        if (side !== 'top' && side !== 'bottom') {
          skipped.push(id)
          continue
        }
        const parentW = n.width || 1
        const absX = target.cx
        const parentLeft = n.parentAbs?.x ?? 0
        const offset = clamp01((absX - parentLeft) / parentW)
        patch[id] = { artifactId: id, side, offset }
      }
      continue
    }

    const ox = n.parentAbs?.x ?? 0
    const oy = n.parentAbs?.y ?? 0
    if (axis === 'horizontal') {
      const newAbsY = target.cy - n.height / 2
      patch[id] = {
        artifactId: id,
        x: n.x,
        y: newAbsY - oy,
        width: n.width,
        height: n.height,
      }
    } else {
      const newAbsX = target.cx - n.width / 2
      patch[id] = {
        artifactId: id,
        x: newAbsX - ox,
        y: n.y,
        width: n.width,
        height: n.height,
      }
    }
  }
  return { patch, skipped }
}
