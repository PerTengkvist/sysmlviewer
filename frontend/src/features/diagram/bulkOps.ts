import type { RoutingType, VisualizationEdge, VisualizationNode } from '../../api'
import { lockTargets, type EditLockPatch } from './editLock'

export type BulkCommand = 'lock' | 'unlock' | 'direct' | 'angular'

export type BulkPatch = {
  nodes: EditLockPatch['nodes']
  edges: Record<
    string,
    | EditLockPatch['edges'][string]
    | Pick<VisualizationEdge, 'artifactId' | 'routing'>
  >
}

const empty = (): BulkPatch => ({ nodes: {}, edges: {} })

/**
 * Apply one command to the current selection.
 * lock/unlock hit selected nodes and edges.
 * direct/angular hit selected edges only and leave waypoints and editLocked alone.
 */
export function bulkOp(
  command: BulkCommand,
  selectedIds: string[],
  nodes: Record<string, Partial<VisualizationNode>>,
  edges: Record<string, Partial<VisualizationEdge>>,
): BulkPatch {
  if (!selectedIds.length) return empty()
  if (command === 'lock' || command === 'unlock') {
    return lockTargets(selectedIds, nodes, edges, command === 'lock')
  }
  const routing: RoutingType = command
  const edgePatch: BulkPatch['edges'] = {}
  for (const id of selectedIds) {
    if (!Object.prototype.hasOwnProperty.call(edges, id)) continue
    edgePatch[id] = { artifactId: id, routing }
  }
  return { nodes: {}, edges: edgePatch }
}
