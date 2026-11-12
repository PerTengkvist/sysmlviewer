import type { Node } from '@xyflow/react'

/**
 * Node types AutoLayout places and routes around: parts (and interfaces,
 * drawn as parts) plus the requirement, use case and actor boxes of
 * requirement / traceability diagrams. Port labels and other overlays follow
 * their owner instead.
 */
const LAYOUT_NODE_TYPES: ReadonlySet<string> = new Set([
  'part',
  'requirement',
  'useCase',
  'actor',
])

export function isLayoutNode(node: Pick<Node, 'type'>): boolean {
  return !node.type || LAYOUT_NODE_TYPES.has(node.type)
}

/** Node types drawn at one fixed size; AutoLayout moves them but never resizes them. */
const FIXED_SIZE_NODE_TYPES: ReadonlySet<string> = new Set(['useCase'])

/**
 * Drop the width and height AutoLayout planned for fixed-size nodes (use
 * cases), so a use case keeps the same size as in a use case view.
 */
export function keepFixedNodeSizes<T extends object>(
  patches: Record<string, T>,
  nodes: Pick<Node, 'id' | 'type'>[],
): Record<string, T> {
  const fixed = new Set(
    nodes.filter((n) => n.type && FIXED_SIZE_NODE_TYPES.has(n.type)).map((n) => n.id),
  )
  if (!fixed.size) return patches
  const out: Record<string, T> = {}
  for (const [id, patch] of Object.entries(patches)) {
    if (!fixed.has(id)) {
      out[id] = patch
      continue
    }
    const { width: _w, height: _h, ...rest } = patch as T & {
      width?: number
      height?: number
    }
    out[id] = rest as T
  }
  return out
}
