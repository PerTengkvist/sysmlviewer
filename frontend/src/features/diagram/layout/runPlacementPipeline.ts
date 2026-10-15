/**
 * Run a resolved AutoLayout placement pipeline (ELK primary + nest/non-overlap).
 */
import type { Edge, Node } from '@xyflow/react'
import type { AutoLayoutDirectives } from './autoLayoutOptions'
import {
  layoutStructureWithElk,
  type ElkStructureLayoutResult,
} from './elkStructureLayout'
import { resolvePlacementPipeline } from './placementPipelines'

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
  const effective: AutoLayoutDirectives = {
    ...directives,
    mode: directives.mode ?? 'simple',
    pipeline: resolved.id,
    algorithm: resolved.elkAlgorithm === 'layered' ? 'layered' : 'stress',
    spacing: resolved.spacing,
    aspectRatio: resolved.aspectRatio,
    portPlacement: resolved.portPlacement,
  }
  return layoutStructureWithElk(nodes, edges, {
    includeEdges: false,
    layoutNodes: true,
    directives: effective,
  })
}
