import type { Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import {
  type AlignableNode,
  type AlignAxis,
  type AlignResult,
} from './align'
import { flowNodesToAlignable } from './alignFlowSelection'

function absOrigin(n: AlignableNode): { x: number; y: number } {
  return {
    x: (n.parentAbs?.x ?? 0) + n.x,
    y: (n.parentAbs?.y ?? 0) + n.y,
  }
}

function absCenter(n: AlignableNode): { cx: number; cy: number } {
  const o = absOrigin(n)
  return { cx: o.x + n.width / 2, cy: o.y + n.height / 2 }
}

/**
 * Evenly space selected part nodes along an axis.
 * horizontal → along X (equal center spacing); vertical → along Y.
 * Requires ≥3 selected; first and last (by position) stay fixed.
 */
export function distributeSelection(
  items: AlignableNode[],
  axis: AlignAxis,
  selectedIds: string[],
): AlignResult {
  if (selectedIds.length < 3) return { patch: {}, skipped: [] }
  const byId = new Map(items.map((i) => [i.id, i]))
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((n): n is AlignableNode => !!n && n.kind !== 'port')
  if (selected.length < 3) return { patch: {}, skipped: [] }

  const ranked = [...selected].sort((a, b) => {
    const ca = absCenter(a)
    const cb = absCenter(b)
    const primary = axis === 'horizontal' ? ca.cx - cb.cx : ca.cy - cb.cy
    return primary || a.id.localeCompare(b.id)
  })

  const first = ranked[0]!
  const last = ranked[ranked.length - 1]!
  const c0 = absCenter(first)
  const c1 = absCenter(last)
  const start = axis === 'horizontal' ? c0.cx : c0.cy
  const end = axis === 'horizontal' ? c1.cx : c1.cy
  const span = end - start
  const n = ranked.length
  const patch: Record<string, Partial<VisualizationNode>> = {}

  for (let i = 1; i < n - 1; i++) {
    const item = ranked[i]!
    const targetCenter = start + (span * i) / (n - 1)
    const ox = item.parentAbs?.x ?? 0
    const oy = item.parentAbs?.y ?? 0
    // Persist position only — never write width/height from layout helpers
    // (unmeasured nodes may carry fallback sizes like 100×40).
    if (axis === 'horizontal') {
      const newAbsX = targetCenter - item.width / 2
      patch[item.id] = {
        artifactId: item.id,
        x: newAbsX - ox,
        y: item.y,
      }
    } else {
      const newAbsY = targetCenter - item.height / 2
      patch[item.id] = {
        artifactId: item.id,
        x: item.x,
        y: newAbsY - oy,
      }
    }
  }
  return { patch, skipped: [] }
}

export function distributeFlowSelection(
  nodes: Node[],
  selectedIds: string[],
  axis: AlignAxis,
): AlignResult {
  return distributeSelection(flowNodesToAlignable(nodes), axis, selectedIds)
}
