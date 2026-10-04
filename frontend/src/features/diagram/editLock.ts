import type { VisualizationEdge, VisualizationNode } from '../../api'

export function isEditLocked(
  entity: { editLocked?: boolean | null } | null | undefined,
): boolean {
  return entity?.editLocked === true
}

export type EditLockPatch = {
  nodes: Record<string, Pick<VisualizationNode, 'artifactId' | 'editLocked'>>
  edges: Record<string, Pick<VisualizationEdge, 'artifactId' | 'editLocked'>>
}

/**
 * Lock or unlock the given ids that exist as nodes or edges in the view.
 * Unknown ids are skipped. `locked: false` is sent explicitly so a saved lock clears.
 */
export function lockTargets(
  ids: string[],
  nodes: Record<string, unknown>,
  edges: Record<string, unknown>,
  locked: boolean,
): EditLockPatch {
  const nodePatch: EditLockPatch['nodes'] = {}
  const edgePatch: EditLockPatch['edges'] = {}
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(nodes, id)) {
      nodePatch[id] = { artifactId: id, editLocked: locked }
    } else if (Object.prototype.hasOwnProperty.call(edges, id)) {
      edgePatch[id] = { artifactId: id, editLocked: locked }
    }
  }
  return { nodes: nodePatch, edges: edgePatch }
}
