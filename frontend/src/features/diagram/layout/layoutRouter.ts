/**
 * Dispatch structure AutoLayout / Redraw / Autoroute between ELK (placement)
 * and the own orthogonal A* router (all final waypoints).
 *
 * Critical: React Flow edge endpoints are in *absolute* flow coordinates.
 * ELK compound layouts produce *parent-relative* bend points. Mixing them
 * makes wires shoot outside the Car / whitebox frame. Therefore ELK is used
 * only for part/port placement; `redrawStructureConnections` always produces
 * the final angular waypoints in absolute space (with strictBounds).
 *
 * Rule: if any involved angular edge has a locked via, use own router for the
 * whole call without moving nodes. Otherwise:
 * - mode `full` + layoutNodes → ELK place, then own route
 * - mode `full` without layoutNodes → own route only (Redraw Connections)
 * - mode `single` → own router for that edge
 */
import type { Edge, Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { SysmlEdgeData } from '../InternalEdge'
import type { AutoLayoutDirectives } from './autoLayoutOptions'
import { applyLayoutToFlowNodes } from './applyLayoutToFlowNodes'
import {
  layoutStructureWithElk,
  type ElkStructureLayoutResult,
} from './elkStructureLayout'
import { runPlacementPipeline } from './runPlacementPipeline'
import {
  redrawStructureConnections,
  type ExistingEdgeRoute,
  type RoutedConnection,
} from './connectionRouting'

export type StructureRouteMode = 'full' | 'single'

export type PlanStructureRoutesInput = {
  mode: StructureRouteMode
  nodes: Node[]
  /** Edges to (re)route. */
  edges: Edge[]
  /** All angular edges for jumper/separation context (defaults to `edges`). */
  contextEdges?: Edge[]
  /** Required for mode `single`. */
  edgeId?: string
  layoutNodes?: boolean
  separation?: number
  /** From AutoLayout dialog; only used when layoutNodes is true. */
  directives?: AutoLayoutDirectives
  existingRoutes?: ExistingEdgeRoute[]
  portLayout?: Record<string, Partial<VisualizationNode>>
  /** Test seams — default to real ELK / own implementations. */
  deps?: {
    runElk?: (args: {
      nodes: Node[]
      edges: Edge[]
      layoutNodes: boolean
      separation: number
      directives?: AutoLayoutDirectives
    }) => Promise<{
      nodes: ElkStructureLayoutResult['nodes']
      edges?: ElkStructureLayoutResult['edges']
      routes: RoutedConnection[]
    }>
    runOwn?: (args: {
      nodes: Node[]
      edges: Edge[]
      existingRoutes?: ExistingEdgeRoute[]
      portLayout?: Record<string, Partial<VisualizationNode>>
      separation: number
      contextEdges: Edge[]
    }) => RoutedConnection[]
  }
}

export type PlanStructureRoutesResult = {
  nodes: ElkStructureLayoutResult['nodes']
  routes: RoutedConnection[]
  engine: 'elk' | 'own'
}

function isAngular(edge: Edge): boolean {
  const data = (edge.data || {}) as SysmlEdgeData
  return (data.routing || 'angular') === 'angular'
}

function edgeHasLockedVia(
  edge: Edge,
  existingRoutes?: ExistingEdgeRoute[],
): boolean {
  const fromExisting = existingRoutes?.find((r) => r.id === edge.id)?.waypoints
  const data = (edge.data || {}) as SysmlEdgeData
  const wps = fromExisting || data.waypoints || []
  return wps.some((w) => w.locked)
}

async function defaultRunElk(args: {
  nodes: Node[]
  edges: Edge[]
  layoutNodes: boolean
  separation: number
  directives?: AutoLayoutDirectives
}): Promise<{
  nodes: ElkStructureLayoutResult['nodes']
  edges?: ElkStructureLayoutResult['edges']
  routes: RoutedConnection[]
}> {
  let nodePatch: ElkStructureLayoutResult['nodes'] = {}
  let routeNodes = args.nodes

  if (args.layoutNodes) {
    // Placement via named pipeline (Simple/Advanced); no ELK edge sections.
    const layout = args.directives
      ? await runPlacementPipeline(args.nodes, args.edges, args.directives)
      : await layoutStructureWithElk(args.nodes, args.edges, {
          includeEdges: false,
          layoutNodes: true,
        })
    nodePatch = layout.nodes
    routeNodes = applyLayoutToFlowNodes(args.nodes, layout.nodes)
    // Let the browser paint / handle "page unresponsive" between ELK and A*.
    await new Promise<void>((r) => setTimeout(r, 0))
  }

  // Ports already applied on routeNodes — do not pass nodePatch as portLayout
  // (it also contains part x/y and confused nothing, but side/offset live on nodes).
  const routes = redrawStructureConnections(
    routeNodes,
    args.edges,
    undefined,
    undefined,
    {
      separation: args.separation,
      contextEdges: args.edges,
    },
  )
  return { nodes: nodePatch, routes }
}

function defaultRunOwn(args: {
  nodes: Node[]
  edges: Edge[]
  existingRoutes?: ExistingEdgeRoute[]
  portLayout?: Record<string, Partial<VisualizationNode>>
  separation: number
  contextEdges: Edge[]
}): RoutedConnection[] {
  return redrawStructureConnections(
    args.nodes,
    args.edges,
    args.portLayout,
    args.existingRoutes,
    {
      separation: args.separation,
      contextEdges: args.contextEdges,
    },
  )
}

export async function planStructureRoutes(
  input: PlanStructureRoutesInput,
): Promise<PlanStructureRoutesResult> {
  const separation = input.separation ?? 5
  const runElk = input.deps?.runElk ?? defaultRunElk
  const runOwn = input.deps?.runOwn ?? defaultRunOwn
  const angular = input.edges.filter(isAngular)
  const contextEdges = (input.contextEdges || input.edges).filter(isAngular)

  if (input.mode === 'single') {
    const edgeId = input.edgeId
    const one = angular.filter((e) => e.id === edgeId)
    const routes = runOwn({
      nodes: input.nodes,
      edges: one.length ? one : [],
      existingRoutes: input.existingRoutes,
      portLayout: input.portLayout,
      separation,
      contextEdges,
    })
    return { nodes: {}, routes, engine: 'own' }
  }

  // full — locked via on any *involved* edge ⇒ own router for the whole call
  const involved = angular
  const hasLocked = involved.some((e) =>
    edgeHasLockedVia(e, input.existingRoutes),
  )
  if (hasLocked) {
    const routes = runOwn({
      nodes: input.nodes,
      edges: involved,
      existingRoutes: input.existingRoutes,
      portLayout: input.portLayout,
      separation,
      contextEdges,
    })
    return { nodes: {}, routes, engine: 'own' }
  }

  const layoutNodes = input.layoutNodes !== false
  const elkResult = await runElk({
    nodes: input.nodes,
    edges: involved,
    layoutNodes,
    separation,
    directives: input.directives,
  })
  return {
    nodes: elkResult.nodes,
    routes: elkResult.routes,
    engine: 'elk',
  }
}
