/**
 * Run a resolved AutoLayout placement pipeline
 * (nest-layout → ELK primary → nest-fit / non-overlap).
 */
import type { Edge, Node } from '@xyflow/react'
import type { AutoLayoutDirectives } from './autoLayoutOptions'
import {
  layoutStructureWithElk,
  type ElkStructureLayoutResult,
} from './elkStructureLayout'
import { resolvePlacementPipeline } from './placementPipelines'
import { layoutHierarchic } from './hierarchicLayout'

/**
 * Place parts/ports according to directives (Simple or Advanced pipeline).
 * Nest-fit + absolute non-overlap run inside layoutStructureWithElk.
 */
export async function runPlacementPipeline(
  nodes: Node[],
  edges: Edge[],
  directives: AutoLayoutDirectives,
): Promise<ElkStructureLayoutResult> {
  const resolved = resolvePlacementPipeline(directives)
  if (resolved.id === 'hierarchic') {
    const r = await layoutHierarchic(nodes, edges, {
      ...directives,
      mode: 'advanced',
      pipeline: 'hierarchic',
      spacing: resolved.spacing,
      portPlacement: resolved.portPlacement,
    })
    return { nodes: r.nodes }
  }
  const effective: AutoLayoutDirectives = {
    ...directives,
    mode: directives.mode ?? 'simple',
    pipeline: resolved.id,
    algorithm:
      resolved.id === 'clustered'
        ? 'clustered'
        : resolved.id === 'favour-grid'
          ? 'favour-grid'
          : resolved.elkAlgorithm === 'layered'
            ? 'layered'
            : 'stress',
    spacing: resolved.spacing,
    aspectRatio: resolved.aspectRatio,
    portPlacement: resolved.portPlacement,
    customWeights: resolved.customWeights ?? directives.customWeights,
  }
  return layoutStructureWithElk(nodes, edges, {
    includeEdges: false,
    layoutNodes: true,
    directives: effective,
  })
}
