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
