import type { Node } from '@xyflow/react'
import { absoluteNodeOrigin } from './modes/structure/buildStructureGraph'

export type NestedViz = { x?: number; y?: number } | null | undefined
export type ParentViz = { x?: number; y?: number } | null | undefined

/**
 * Resolve stored visualization x/y for a nested part (parent-relative).
 * Autolayout and the layout wizard sometimes persisted canvas coordinates;
 * those are converted using the parent's stored position when possible.
 */
export function resolveNestedPartPosition(
  viz: NestedViz,
  parentW: number,
  parentH: number,
  parentViz: ParentViz,
  defaultX: number,
  defaultY: number,
): { x: number; y: number } {
  if (!viz || !Number.isFinite(viz.x) || !Number.isFinite(viz.y)) {
    return { x: defaultX, y: defaultY }
  }

  let x = viz.x
  let y = viz.y
  const parentX = parentViz?.x ?? 0
  const parentY = parentViz?.y ?? 0

  const outsideParent =
    parentW > 0 &&
    parentH > 0 &&
    (x > parentW + 8 || y > parentH + 8 || x < -32)

  if (
    outsideParent &&
    Number.isFinite(parentX) &&
    Number.isFinite(parentY) &&
    (Math.abs(parentX) > 8 || Math.abs(parentY) > 8)
  ) {
    const rx = x - parentX
    const ry = y - parentY
    if (rx >= -32 && ry >= -32 && rx < parentW + 32 && ry < parentH + 32) {
      x = rx
      y = ry
    }
  }

  if (x >= -32 && y >= -32 && x < parentW + 32 && y < parentH + 32) {
    const maxX = Math.max(0, parentW - 40)
    const maxY = Math.max(0, parentH - 40)
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    }
  }

  return { x: defaultX, y: defaultY }
}

/** Map a canvas (flow) position to this node's parent-relative position. */
export function relativePositionFromFlow(
  node: Node,
  flow: { x: number; y: number },
  byId: Map<string, Node>,
): { x: number; y: number } {
  const abs = absoluteNodeOrigin(node, byId)
  return {
    x: node.position.x + (flow.x - abs.x),
    y: node.position.y + (flow.y - abs.y),
  }
}
