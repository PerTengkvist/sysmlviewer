import type { ElementStyle } from '../../api'

const NODE_KINDS = new Set([
  'package',
  'part',
  'requirement',
  'useCase',
  'use_case',
  'actor',
  'interface',
  'state',
  'action',
  'lifeline',
  'tree',
  'interaction',
])

const EDGE_KINDS = new Set([
  'connection',
  'dependency',
  'allocation',
  'binding',
  'flow',
  'specialization',
  'subsetting',
  'redefinition',
  'message',
  'transition',
  'succession',
  'include',
  'satisfy',
])

function isNodeKind(kind: string): boolean {
  return NODE_KINDS.has(kind)
}

function isEdgeKind(kind: string): boolean {
  return EDGE_KINDS.has(kind)
}

/** Deep-clone ElementStyle for paint; returns null if kinds are incompatible. */
export function copyStyle(
  sourceStyle: ElementStyle | null | undefined,
  sourceKind: string,
  targetKind: string,
): ElementStyle | null {
  if (!sourceStyle) return null
  const srcNode = isNodeKind(sourceKind)
  const tgtNode = isNodeKind(targetKind)
  const srcEdge = isEdgeKind(sourceKind)
  const tgtEdge = isEdgeKind(targetKind)
  if (srcNode !== tgtNode || srcEdge !== tgtEdge) return null
  if (!srcNode && !srcEdge) return null
  return JSON.parse(JSON.stringify(sourceStyle)) as ElementStyle
}
