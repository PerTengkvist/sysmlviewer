import type { PortSide, VisualizationNode } from '../../../api'

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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
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
