import type { Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { isLayoutNode } from './layoutNodes'

/**
 * The frame AutoLayout keeps in place and fits around everything else.
 *
 * buildStructureGraph flags every container as `isBoundary`. Only a flagged
 * node that every other placed node sits inside (a whitebox root) is a
 * frame. Top-level containers in a package root, or a whitebox root with a
 * second exposed root beside it, are ordinary nodes placed among their
 * siblings; treating one of them as the frame made it swallow the rest.
 */

function flagged(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

export function layoutBoundaryId(nodes: Node[]): string | null {
  const placed = nodes.filter(isLayoutNode)
  const byId = new Map(placed.map((n) => [n.id, n]))
  const top = placed.filter((n) => !(n.parentId && byId.has(n.parentId)))
  if (top.length !== 1) return null
  const root = top[0]!
  return flagged(root) ? root.id : null
}

/**
 * Clear `isBoundary` on every node except the real frame, so each layout
 * step that looks for "the" boundary finds the right one or none.
 */
export function normalizeLayoutBoundary(nodes: Node[]): Node[] {
  const keep = layoutBoundaryId(nodes)
  return nodes.map((n) => {
    if (!flagged(n) || n.id === keep) return n
    return { ...n, data: { ...(n.data as PartNodeData), isBoundary: false } }
  })
}
