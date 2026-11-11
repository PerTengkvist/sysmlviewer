import type { Edge } from '@xyflow/react'
import {
  asAngularForLayout,
  NODE_RELATION_KINDS,
  structureEdgesForLayout,
} from './elkStructureLayout'

/** AutoLayout dialog: which edges decide where nodes go. */
export type LayoutEdgeKinds = {
  connections: boolean
  bindings: boolean
  /** Dependencies, satisfy, include, allocation, specialization, … */
  relations: boolean
}

/** Relation edges (drawn node to node, not port to port) layout may use. */
export const RELATION_LAYOUT_KINDS: ReadonlySet<string> = new Set([
  'dependency',
  'satisfy',
  'include',
  'allocation',
  'flow',
  'specialization',
  'subsetting',
  'redefinition',
])

function kindOf(edge: Edge): string | undefined {
  return (edge.data as { relationKind?: string } | undefined)?.relationKind
}

/** A relation drawn between node boundaries (no port at either end). */
export function isRelationLayoutEdge(edge: Edge): boolean {
  const kind = kindOf(edge) || ''
  if (NODE_RELATION_KINDS.has(kind)) return true
  if (!RELATION_LAYOUT_KINDS.has(kind)) return false
  // Flows run port to port (routed like connections) or part to part.
  const sp = edge.sourceHandle || ''
  const tp = edge.targetHandle || ''
  return sp.startsWith('rel-') || tp.startsWith('rel-') || !sp || !tp
}

/**
 * Split diagram edges for AutoLayout:
 * - `routed`: connections (and bindings unless `routeBindings` is false),
 *   re-routed after placement exactly as before;
 * - `placement`: the edges that pull nodes together, by the dialog's
 *   checkboxes. Relations become node-to-node edges without handles, so
 *   every placement pipeline treats them as plain node links.
 */
export function layoutEdgesFor(
  edges: Edge[],
  kinds: LayoutEdgeKinds,
  opts: { routeBindings?: boolean } = {},
): { routed: Edge[]; placement: Edge[] } {
  const routed = asAngularForLayout(edges, {
    includeBindings: opts.routeBindings !== false,
  })
  const placement: Edge[] = []
  for (const e of structureEdgesForLayout(edges, { includeBindings: true })) {
    const wanted = kindOf(e) === 'binding' ? kinds.bindings : kinds.connections
    if (wanted) placement.push(e)
  }
  if (kinds.relations) {
    for (const e of edges) {
      if (e.source === e.target || !isRelationLayoutEdge(e)) continue
      placement.push({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: null,
        targetHandle: null,
        data: { relationKind: kindOf(e), placementOnly: true },
      })
    }
  }
  return { routed, placement }
}

/**
 * Default for a view without a saved choice: connections, bindings as the
 * routing setting says, relations only when the diagram has no connections
 * (requirement / traceability diagrams).
 */
export function defaultLayoutEdgeKinds(
  edges: Edge[],
  includeBindings: boolean,
): LayoutEdgeKinds {
  return {
    connections: true,
    bindings: includeBindings,
    relations: !edges.some((e) => kindOf(e) === 'connection'),
  }
}

export function resolveLayoutEdgeKinds(
  saved: LayoutEdgeKinds | null | undefined,
  edges: Edge[],
  includeBindings: boolean,
): LayoutEdgeKinds {
  return saved ?? defaultLayoutEdgeKinds(edges, includeBindings)
}
