/**
 * ELK-backed structure AutoLayout (GeneralView): place parts + ports + routes.
 *
 * AutoLayout (layoutNodes=true): `stress` for 2D connection-aware placement
 * (high-degree nodes tend toward the center, aspectRatio ≈ 1). Orthogonal
 * waypoints are computed with our router afterward (stress edges are straight).
 *
 * Redraw Connections (layoutNodes=false): `layered` + ORTHOGONAL with fixed
 * node positions for bend points, with A* repair if a path cuts a part.
 */
import ELK, {
  type ElkNode,
  type ElkPort,
  type ElkExtendedEdge,
  type ElkEdgeSection,
  type ElkPoint,
} from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import { sizePartForPorts } from './structureAutoLayout'
import { clampPortOffset } from './portPlacement'
import {
  clampLevelWeights,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  inferPortFlowRole,
  spacingToDesiredEdgeLength,
  spacingToNodeNode,
  type AutoLayoutDirectives,
  type PortPlacementMode,
} from './autoLayoutOptions'
import {
  enforceFlowLeftToRight,
  fitNestedChildrenInParents,
  separateAbsoluteOverlaps,
  type ParentOfMap,
} from './flowPlacement'
import { planScope } from './adaptiveLayoutPolicy'
import { layoutBalancedBottomUp } from './balancedLayout'
import { normalizeAutoLayoutCanvas } from './layoutNormalize'
import {
  resolvePlacementPipeline,
  type PipelineElkAlgorithm,
} from './placementPipelines'
import {
  applyNestPatchToNodes,
  layoutNestBottomUp,
  layoutNestBottomUpAdaptive,
} from './nestBottomUp'
import { simplifyOrtho } from '../edgeRouting'
import {
  pathCrossesObstaclesMid,
  redrawStructureConnections,
  routeOrthogonal,
  type Rect,
  type RoutedConnection,
} from './connectionRouting'
import {
  computeJumpers,
  cornersFromFull,
  separateUnrelatedRoutes,
} from './connectionSeparation'

export type ElkEdgeLike = {
  id: string
  sections?: ElkEdgeSection[]
}

export type ElkWaypoint = { x: number; y: number; locked?: boolean }

const MIN_W = 140
const MIN_H = 72
const PAD = 48

export type ElkGraphBuildOptions = {
  /** When false, edges are still included for layering but result omits waypoints. */
  includeEdges?: boolean
  /** When false, keep node positions (phase B redraw). Default true. */
  layoutNodes?: boolean
  /** AutoLayout dialog directives (ignored when layoutNodes is false). */
  directives?: AutoLayoutDirectives
  /** Override ELK algorithm (custom adaptive root choice). */
  elkAlgorithmOverride?: PipelineElkAlgorithm
  /** Multiply node/edge spacing (custom weights). Default 1. */
  spacingScale?: number
  /** Force FIXED_SIDE port constraints on the root graph. */
  fixedSidePorts?: boolean
}

export type ElkStructureLayoutResult = {
  nodes: Record<string, Partial<VisualizationNode>>
  edges?: Record<
    string,
    {
      artifactId: string
      routing: 'angular'
      waypoints: ElkWaypoint[]
    }
  >
}

/** Full polyline including section start/end (parent / root coordinates). */
export function fullPolylineFromElkEdge(edge: ElkEdgeLike): { x: number; y: number }[] {
  const sections = edge.sections || []
  if (!sections.length) return []
  const pts: ElkPoint[] = []
  for (const sec of sections) {
    if (!pts.length) pts.push(sec.startPoint)
    else {
      const last = pts[pts.length - 1]
      if (last.x !== sec.startPoint.x || last.y !== sec.startPoint.y) {
        pts.push(sec.startPoint)
      }
    }
    for (const b of sec.bendPoints || []) pts.push(b)
    pts.push(sec.endPoint)
  }
  return simplifyOrtho(pts.map((p) => ({ x: p.x, y: p.y })))
}

/**
 * Convert ELK edge sections to orthogonal corner waypoints (no endpoints).
 */
export function waypointsFromElkEdge(edge: ElkEdgeLike): ElkWaypoint[] {
  const full = fullPolylineFromElkEdge(edge)
  if (full.length <= 2) return []
  return full.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
}

function childObstacleRects(
  nodes: Node[],
  sizes: Map<string, { width: number; height: number }>,
  positions: Map<string, { x: number; y: number }>,
  excludeIds: Set<string>,
): Rect[] {
  const out: Rect[] = []
  for (const n of nodes) {
    if (isBoundary(n)) continue
    if (n.type && n.type !== 'part') continue
    if (excludeIds.has(n.id)) continue
    const sz = sizes.get(n.id) || readSize(n)
    const pos = positions.get(n.id) || n.position
    out.push({
      minX: pos.x,
      minY: pos.y,
      maxX: pos.x + sz.width,
      maxY: pos.y + sz.height,
    })
  }
  return out
}

function portPointOnPart(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  side: PortSide,
  offset: number,
): { x: number; y: number } {
  const o = Math.min(1, Math.max(0, offset))
  switch (side) {
    case 'left':
      return { x: pos.x, y: pos.y + size.height * o }
    case 'right':
      return { x: pos.x + size.width, y: pos.y + size.height * o }
    case 'top':
      return { x: pos.x + size.width * o, y: pos.y }
    case 'bottom':
      return { x: pos.x + size.width * o, y: pos.y + size.height }
  }
}

function collectLaidOutEdges(
  elkNode: ElkNode,
  out: Map<string, ElkExtendedEdge>,
): void {
  for (const e of elkNode.edges || []) out.set(e.id, e)
  for (const c of elkNode.children || []) collectLaidOutEdges(c, out)
}

const elk = new ELK()

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

function readSize(n: Node): { width: number; height: number } {
  const w =
    (typeof n.style?.width === 'number' && n.style.width) ||
    n.width ||
    MIN_W
  const h =
    (typeof n.style?.height === 'number' && n.style.height) ||
    n.height ||
    MIN_H
  return { width: Number(w) || MIN_W, height: Number(h) || MIN_H }
}

/** Normalize child coords to PAD and grow the whitebox so content stays inside. */
function fitBoundaryAroundChildren(
  boundaryId: string,
  boundary: Node | undefined,
  nodePatch: Record<string, Partial<VisualizationNode>>,
  sizeMap: Map<string, { width: number; height: number }>,
  posMap: Map<string, { x: number; y: number }>,
): void {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [id, pos] of posMap) {
    if (id === boundaryId) continue
    const sz = sizeMap.get(id) || { width: MIN_W, height: MIN_H }
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + sz.width)
    maxY = Math.max(maxY, pos.y + sz.height)
  }
  if (!Number.isFinite(minX)) return

  const shiftX = PAD - minX
  const shiftY = PAD - minY
  for (const [id, pos] of posMap) {
    if (id === boundaryId) continue
    const next = { x: pos.x + shiftX, y: pos.y + shiftY }
    posMap.set(id, next)
    if (nodePatch[id]) {
      nodePatch[id] = { ...nodePatch[id], x: next.x, y: next.y }
    }
  }
  maxX += shiftX
  maxY += shiftY
  const bw = Math.max(420, maxX + PAD)
  const bh = Math.max(260, maxY + PAD)
  sizeMap.set(boundaryId, { width: bw, height: bh })
  nodePatch[boundaryId] = {
    ...(nodePatch[boundaryId] || { artifactId: boundaryId }),
    x: nodePatch[boundaryId]?.x ?? boundary?.position.x ?? 0,
    y: nodePatch[boundaryId]?.y ?? boundary?.position.y ?? 0,
    width: bw,
    height: bh,
  }
}

function sideToElk(side: PortSide): string {
  switch (side) {
    case 'left':
      return 'WEST'
    case 'right':
      return 'EAST'
    case 'top':
      return 'NORTH'
    case 'bottom':
      return 'SOUTH'
  }
}

/** Derive side + normalized offset from ELK port position on a node. */
export function portFromElk(
  port: { id: string; x?: number; y?: number; width?: number; height?: number },
  nodeWidth: number,
  nodeHeight: number,
): { side: PortSide; offset: number } {
  const px = (port.x ?? 0) + (port.width ?? 0) / 2
  const py = (port.y ?? 0) + (port.height ?? 0) / 2
  const distLeft = px
  const distRight = nodeWidth - px
  const distTop = py
  const distBottom = nodeHeight - py
  const min = Math.min(distLeft, distRight, distTop, distBottom)

  let side: PortSide
  let offset: number
  if (min === distLeft) {
    side = 'left'
    offset = nodeHeight > 0 ? py / nodeHeight : 0.5
  } else if (min === distRight) {
    side = 'right'
    offset = nodeHeight > 0 ? py / nodeHeight : 0.5
  } else if (min === distTop) {
    side = 'top'
    offset = nodeWidth > 0 ? px / nodeWidth : 0.5
  } else {
    side = 'bottom'
    offset = nodeWidth > 0 ? px / nodeWidth : 0.5
  }
  return {
    side,
    offset: clampPortOffset(offset, side, nodeHeight),
  }
}

type ConnLink = {
  edgeId: string
  sourcePart: string
  targetPart: string
  sourcePort: string
  targetPort: string
}

function collectLinks(edges: Edge[]): ConnLink[] {
  const out: ConnLink[] = []
  for (const e of edges) {
    const sp = portIdFromHandle(e.sourceHandle)
    const tp = portIdFromHandle(e.targetHandle)
    if (!sp || !tp) continue
    out.push({
      edgeId: e.id,
      sourcePart: e.source,
      targetPart: e.target,
      sourcePort: sp,
      targetPort: tp,
    })
  }
  return out
}

export type StructureEdgesForLayoutOpts = {
  /** When false, exclude binding edges from redraw / AutoLayout. Default true. */
  includeBindings?: boolean
}

/**
 * Edges that participate in structure AutoLayout / angular redraw:
 * port-to-port connections (and connection relationKind), including `direct`.
 * Port–port bindings are included unless `includeBindings` is false.
 */
export function structureEdgesForLayout(
  edges: Edge[],
  opts?: StructureEdgesForLayoutOpts,
): Edge[] {
  const includeBindings = opts?.includeBindings !== false
  return edges.filter((e) => {
    const data = (e.data || {}) as { relationKind?: string; routing?: string }
    if (data.relationKind === 'binding' && !includeBindings) return false
    if (data.relationKind === 'connection') return true
    const sp = e.sourceHandle || ''
    const tp = e.targetHandle || ''
    if (sp.startsWith('rel-') || tp.startsWith('rel-')) return false
    if (sp && tp) return true
    return (data.routing || 'angular') === 'angular'
  })
}

/** Promote structure edges to angular so the layout router includes them. */
export function asAngularForLayout(
  edges: Edge[],
  opts?: StructureEdgesForLayoutOpts,
): Edge[] {
  return structureEdgesForLayout(edges, opts).map((e) => ({
    ...e,
    data: {
      ...((e.data || {}) as Record<string, unknown>),
      routing: 'angular',
    },
  }))
}

/** Optimized: match boundary peer; else face peer part horizontally. */
function seedPortSideOptimized(
  port: PartPort,
  owner: Node,
  links: ConnLink[],
  byId: Map<string, Node>,
  boundary: Node | undefined,
): PortSide {
  const related = links.filter(
    (l) => l.sourcePort === port.id || l.targetPort === port.id,
  )
  if (boundary) {
    for (const l of related) {
      const otherPart = l.sourcePort === port.id ? l.targetPart : l.sourcePart
      const otherPort = l.sourcePort === port.id ? l.targetPort : l.sourcePort
      if (otherPart !== boundary.id) continue
      const bp = portsOf(boundary).find((p) => p.id === otherPort)
      if (bp && (bp.side === 'left' || bp.side === 'right')) return bp.side
    }
  }
  let dx = 0
  let n = 0
  for (const l of related) {
    const peerId = l.sourcePort === port.id ? l.targetPart : l.sourcePart
    const peer = byId.get(peerId)
    if (!peer || peer.id === owner.id) continue
    dx +=
      peer.position.x +
      readSize(peer).width / 2 -
      (owner.position.x + readSize(owner).width / 2)
    n += 1
  }
  if (n > 0) return dx >= 0 ? 'right' : 'left'
  return port.side === 'top' || port.side === 'bottom' ? 'right' : port.side
}

/** Inputs on left, outputs on right (name + connection heuristics). */
function seedPortSideIoFixed(
  port: PartPort,
  links: ConnLink[],
): PortSide {
  const role = inferPortFlowRole(port, links)
  if (role === 'in') return 'left'
  if (role === 'out') return 'right'
  // Unknown: prefer optimized-ish fallback from connection end
  let asSource = 0
  let asTarget = 0
  for (const l of links) {
    if (l.sourcePort === port.id) asSource += 1
    if (l.targetPort === port.id) asTarget += 1
  }
  if (asTarget >= asSource) return 'left'
  return 'right'
}

export function seedPortSide(
  port: PartPort,
  owner: Node,
  links: ConnLink[],
  byId: Map<string, Node>,
  boundary: Node | undefined,
  mode: PortPlacementMode = 'optimized',
): PortSide {
  if (mode === 'inputsLeftOutputsRight') {
    return seedPortSideIoFixed(port, links)
  }
  return seedPortSideOptimized(port, owner, links, byId, boundary)
}

function makeElkPort(port: PartPort, side: PortSide): ElkPort {
  void port
  return {
    id: port.id,
    width: 1,
    height: 1,
    layoutOptions: {
      'org.eclipse.elk.port.side': sideToElk(side),
    },
  }
}

function layoutRootOptions(
  layoutNodes: boolean,
  directives: AutoLayoutDirectives = DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  overrides: {
    elkAlgorithmOverride?: PipelineElkAlgorithm
    spacingScale?: number
    fixedSidePorts?: boolean
  } = {},
): Record<string, string> {
  const scale = overrides.spacingScale ?? 1
  const pad = `[top=${PAD},left=${PAD},bottom=${PAD},right=${PAD}]`
  const nodeNode = String(
    Math.round(spacingToNodeNode(directives.spacing) * scale),
  )
  const edgeLen = String(
    Math.round(spacingToDesiredEdgeLength(directives.spacing) * scale),
  )
  if (layoutNodes) {
    const resolved = resolvePlacementPipeline(directives)
    const algo = overrides.elkAlgorithmOverride ?? resolved.elkAlgorithm
    const fixedSide = overrides.fixedSidePorts === true
    if (algo === 'layered') {
      return {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.padding': pad,
        'elk.spacing.nodeNode': nodeNode,
        'elk.layered.spacing.nodeNodeBetweenLayers': edgeLen,
        'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
        'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      }
    }
    if (algo === 'force') {
      return {
        'elk.algorithm': 'force',
        'elk.aspectRatio': String(directives.aspectRatio || 1),
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.padding': pad,
        'elk.spacing.nodeNode': nodeNode,
        'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        ...(fixedSide
          ? { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' }
          : {}),
      }
    }
    if (algo === 'rectpacking') {
      return {
        'elk.algorithm': 'rectpacking',
        'elk.padding': pad,
        'elk.spacing.nodeNode': nodeNode,
        'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      }
    }
    // Stress (connection-aware default): hubs toward center.
    return {
      'elk.algorithm': 'stress',
      'elk.aspectRatio': String(directives.aspectRatio || 1),
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': pad,
      'elk.spacing.nodeNode': nodeNode,
      'elk.stress.desiredEdgeLength': edgeLen,
      'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      ...(fixedSide
        ? { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' }
        : {}),
    }
  }
  // Fixed-node redraw: layered orthogonal for bend points.
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.padding': pad,
    'elk.spacing.nodeNode': '80',
    'elk.layered.spacing.nodeNodeBetweenLayers': '96',
    'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
    'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'org.eclipse.elk.layered.layering.strategy': 'INTERACTIVE',
    'org.eclipse.elk.layered.nodePlacement.strategy': 'INTERACTIVE',
  }
}

/**
 * Build an ELK compound graph: boundary as root with *direct* child parts only.
 * AutoLayout uses part↔part edges (stress). Redraw uses port endpoints (layered).
 */
export function buildElkGraph(
  nodes: Node[],
  edges: Edge[],
  options: ElkGraphBuildOptions = {},
): ElkNode {
  const layoutNodes = options.layoutNodes !== false
  const directives = options.directives || DEFAULT_AUTO_LAYOUT_DIRECTIVES
  const resolved = resolvePlacementPipeline(directives)
  void options.includeEdges
  void resolved

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const boundary = nodes.find(isBoundary)
  const boundaryId = boundary?.id
  // Only peers under the boundary (nested grandchildren keep their parentId).
  const children = nodes.filter((n) => {
    if (isBoundary(n)) return false
    if (n.type && n.type !== 'part') return false
    if (boundaryId) return n.parentId === boundaryId
    return !n.parentId
  })
  const childIds = new Set(children.map((c) => c.id))
  const links = collectLinks(edges)
  const portMode = directives.portPlacement

  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of [...children, ...(boundary ? [boundary] : [])]) {
    const ports = portsOf(node)
    const seeded = ports.map((p) => ({
      name: p.name,
      side: seedPortSide(p, node, links, byId, boundary, portMode),
    }))
    const label = (node.data as PartNodeData)?.label || node.id
    if (isBoundary(node)) {
      sizes.set(node.id, readSize(node))
    } else {
      const portSize = sizePartForPorts(
        label,
        seeded.length ? seeded : [{ name: '·', side: 'right' }],
      )
      // Prefer nest-grown (or otherwise pre-sized) boxes over port-only minima.
      const current = readSize(node)
      sizes.set(node.id, {
        width: Math.max(portSize.width, current.width),
        height: Math.max(portSize.height, current.height),
      })
    }
  }

  const portSideById = new Map<string, PortSide>()
  for (const node of [...children, ...(boundary ? [boundary] : [])]) {
    for (const p of portsOf(node)) {
      portSideById.set(
        p.id,
        seedPortSide(p, node, links, byId, boundary, portMode),
      )
    }
  }

  const toElkChild = (node: Node): ElkNode => {
    const sz = sizes.get(node.id) || readSize(node)
    const ports = portsOf(node).map((p) =>
      makeElkPort(p, portSideById.get(p.id) || p.side),
    )
    const useFixedPorts =
      !layoutNodes ||
      resolved.elkAlgorithm === 'layered' ||
      portMode === 'inputsLeftOutputsRight'
    return {
      id: node.id,
      width: sz.width,
      height: sz.height,
      ...(layoutNodes ? {} : { x: node.position.x, y: node.position.y }),
      ports,
      layoutOptions: layoutNodes
        ? {
            'org.eclipse.elk.portConstraints': useFixedPorts
              ? 'FIXED_SIDE'
              : 'FREE',
          }
        : {
            'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
            'org.eclipse.elk.layered.layering.strategy': 'INTERACTIVE',
            'org.eclipse.elk.layered.nodePlacement.strategy': 'INTERACTIVE',
            'org.eclipse.elk.position': `(${node.position.x},${node.position.y})`,
          },
    }
  }

  // Connectivity for placement: part↔part among laid-out children (not boundary).
  // Port endpoints are used only for layered redraw routing.
  const elkEdges: ElkExtendedEdge[] = []
  const seen = new Set<string>()
  for (const l of links) {
    if (l.sourcePart === boundaryId || l.targetPart === boundaryId) continue
    if (!childIds.has(l.sourcePart) || !childIds.has(l.targetPart)) continue
    if (seen.has(l.edgeId)) continue
    seen.add(l.edgeId)
    if (layoutNodes) {
      elkEdges.push({
        id: l.edgeId,
        sources: [l.sourcePart],
        targets: [l.targetPart],
      })
    } else {
      elkEdges.push({
        id: l.edgeId,
        sources: [l.sourcePort],
        targets: [l.targetPort],
      })
    }
  }
  // Also include edges that only have part endpoints (no port handles).
  for (const e of edges) {
    if (seen.has(e.id)) continue
    if (!childIds.has(e.source) || !childIds.has(e.target)) continue
    if (e.source === boundaryId || e.target === boundaryId) continue
    seen.add(e.id)
    elkEdges.push({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })
  }

  const childNodes = children.map(toElkChild)
  const rootOpts = layoutRootOptions(layoutNodes, directives, {
    elkAlgorithmOverride: options.elkAlgorithmOverride,
    spacingScale: options.spacingScale,
    fixedSidePorts:
      options.fixedSidePorts === true ||
      options.elkAlgorithmOverride === 'layered',
  })

  if (boundary) {
    const bPorts = portsOf(boundary).map((p) =>
      makeElkPort(p, portSideById.get(p.id) || p.side),
    )
    return {
      id: boundary.id,
      width: sizes.get(boundary.id)?.width || readSize(boundary).width,
      height: sizes.get(boundary.id)?.height || readSize(boundary).height,
      children: childNodes,
      ports: bPorts,
      edges: elkEdges,
      layoutOptions: rootOpts,
    }
  }

  return {
    id: 'root',
    children: childNodes,
    edges: elkEdges,
    layoutOptions: rootOpts,
  }
}

function collectLaidOutNodes(
  elkNode: ElkNode,
  out: Map<string, ElkNode>,
): void {
  out.set(elkNode.id, elkNode)
  for (const c of elkNode.children || []) collectLaidOutNodes(c, out)
}

/**
 * Run ELK and return visualization patches for parts + ports.
 * Phase A: no `edges` in the result.
 */
/**
 * Nested containers are flagged `isBoundary` by buildStructureGraph; for
 * placement only the root boundary is special. Demote the rest so they are
 * placed among their siblings (and grown around their children) like parts.
 */
export function demoteNestedBoundaries(nodes: Node[]): Node[] {
  const partIds = new Set(
    nodes.filter((n) => !n.type || n.type === 'part').map((n) => n.id),
  )
  return nodes.map((n) => {
    if (!isBoundary(n)) return n
    if (!n.parentId || !partIds.has(n.parentId)) return n
    return {
      ...n,
      data: { ...(n.data as PartNodeData), isBoundary: false },
    }
  })
}

export async function layoutStructureWithElk(
  inputNodes: Node[],
  edges: Edge[],
  options: ElkGraphBuildOptions = {},
): Promise<ElkStructureLayoutResult> {
  const nodes =
    options.layoutNodes !== false ? demoteNestedBoundaries(inputNodes) : inputNodes
  const includeEdges = options.includeEdges === true
  const layoutNodes = options.layoutNodes !== false
  const directives = options.directives || DEFAULT_AUTO_LAYOUT_DIRECTIVES
  const resolved = resolvePlacementPipeline(directives)
  const isCustom = resolved.id === 'custom'
  const isComposition =
    resolved.id === 'clustered' || resolved.id === 'favour-grid'
  const compositionVariant =
    resolved.id === 'favour-grid' ? 'favour-grid' : 'clustered'
  const customWeights = isCustom
    ? (resolved.customWeights ?? clampLevelWeights(directives.customWeights))
    : undefined

  let rootAlgoOverride = options.elkAlgorithmOverride
  let rootSpacingScale = options.spacingScale
  let rootFixedSide: boolean | undefined

  if (isCustom && customWeights && layoutNodes) {
    const boundary = nodes.find(isBoundary)
    if (boundary) {
      const rootPlan = planScope(boundary.id, nodes, edges, customWeights, {
        isBoundary: true,
        depth: 0,
      })
      rootAlgoOverride = rootAlgoOverride ?? rootPlan.algorithm
      rootSpacingScale = rootSpacingScale ?? rootPlan.spacingScale
      rootFixedSide = rootPlan.useFixedSidePorts
    }
  }

  // Bottom-up nest: place nested children and grow parents before top-level ELK.
  let workingNodes = nodes
  let nestPatch: Record<string, Partial<VisualizationNode>> = {}
  if (layoutNodes && resolved.steps.includes('nest-layout')) {
    if (isComposition) {
      const nest = layoutBalancedBottomUp(nodes, edges, {
        spacing: directives.spacing,
        aspectRatio: directives.aspectRatio || 1,
        variant: compositionVariant,
      })
      nestPatch = nest.nodePatch
      workingNodes = applyNestPatchToNodes(nodes, nestPatch)
    } else if (isCustom && customWeights) {
      const nest = await layoutNestBottomUpAdaptive(nodes, edges, customWeights, {
        pad: 24,
        aspectRatio: directives.aspectRatio || 1,
        baseNodeNode: spacingToNodeNode(directives.spacing) * 0.5,
      })
      nestPatch = nest.nodePatch
      workingNodes = applyNestPatchToNodes(nodes, nestPatch)
    } else {
      const nest = layoutNestBottomUp(nodes, edges, { pad: 24 })
      nestPatch = nest.nodePatch
      workingNodes = applyNestPatchToNodes(nodes, nestPatch)
    }
  }

  // Composition owns part placement (no ELK). Redraw / other pipelines still use ELK.
  const skipElkPlacement = isComposition && layoutNodes
  const byElk = new Map<string, ElkNode>()
  let laidOut: ElkNode | null = null
  if (!skipElkPlacement) {
    const graph = buildElkGraph(workingNodes, edges, {
      includeEdges,
      layoutNodes,
      directives: isComposition
        ? { ...directives, algorithm: 'stress', pipeline: 'connection-aware' }
        : directives,
      elkAlgorithmOverride: rootAlgoOverride,
      spacingScale: rootSpacingScale,
      fixedSidePorts: rootFixedSide,
    })
    laidOut = await elk.layout(graph)
    collectLaidOutNodes(laidOut, byElk)
  }

  const byId = new Map(workingNodes.map((n) => [n.id, n]))
  const nodePatch: Record<string, Partial<VisualizationNode>> = {}

  if (skipElkPlacement) {
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      const fromNest = nestPatch[node.id]
      const fallback = readSize(node)
      nodePatch[node.id] = {
        artifactId: node.id,
        x: fromNest?.x ?? node.position.x,
        y: fromNest?.y ?? node.position.y,
        width: fromNest?.width ?? fallback.width,
        height: fromNest?.height ?? fallback.height,
      }
    }
  } else {
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      const en = byElk.get(node.id)
      if (!en) continue

      const fallback = readSize(node)
      const nestSz = nestPatch[node.id]
      const width = Math.max(
        en.width && en.width > 0 ? en.width : 0,
        nestSz?.width ?? 0,
        fallback.width,
      )
      const height = Math.max(
        en.height && en.height > 0 ? en.height : 0,
        nestSz?.height ?? 0,
        fallback.height,
      )

      if (isBoundary(node)) {
        nodePatch[node.id] = {
          artifactId: node.id,
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        }
      } else if (layoutNodes) {
        nodePatch[node.id] = {
          artifactId: node.id,
          x: en.x ?? node.position.x,
          y: en.y ?? node.position.y,
          width,
          height,
        }
      } else {
        nodePatch[node.id] = {
          artifactId: node.id,
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        }
      }

      const w = width
      const h = height
      // Only adopt ELK port sides after AutoLayout. On redraw, ELK interactive
      // often drifts ports to left/right and portFromElk would overwrite bottom/top.
      if (layoutNodes) {
        for (const ep of en.ports || []) {
          const placed = portFromElk(ep, w, h)
          nodePatch[ep.id] = {
            artifactId: ep.id,
            side: placed.side,
            offset: placed.offset,
          }
        }
      }
    }
  }

  // After AutoLayout placement, assign port sides per dialog directive.
  if (layoutNodes) {
    // Nested parts ELK did not place: prefer nest-layout patch over stale RF coords.
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      if (nodePatch[node.id]) continue
      if (isBoundary(node)) continue
      const fromNest = nestPatch[node.id]
      if (fromNest?.x != null && fromNest?.y != null) {
        nodePatch[node.id] = { ...fromNest, artifactId: node.id }
        continue
      }
      const sz = readSize(node)
      nodePatch[node.id] = {
        artifactId: node.id,
        x: node.position.x,
        y: node.position.y,
        width: sz.width,
        height: sz.height,
      }
    }

    const parentOf: ParentOfMap = new Map()
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      parentOf.set(node.id, node.parentId)
    }
    const partIds = workingNodes
      .filter(
        (n) =>
          !isBoundary(n) &&
          (!n.type || n.type === 'part') &&
          nodePatch[n.id]?.x != null,
      )
      .map((n) => n.id)

    // Pipeline post-chain: nest-fit → absolute non-overlap → optional flow nudge.
    if (resolved.steps.includes('nest-fit')) {
      fitNestedChildrenInParents(nodePatch, parentOf, 24)
    }
    if (resolved.steps.includes('non-overlap')) {
      separateAbsoluteOverlaps(
        nodePatch,
        partIds,
        parentOf,
        Math.max(16, spacingToNodeNode(directives.spacing) * 0.35),
      )
      // Nest again in case separation pushed children past parent edges.
      fitNestedChildrenInParents(nodePatch, parentOf, 24)
      separateAbsoluteOverlaps(
        nodePatch,
        partIds,
        parentOf,
        Math.max(16, spacingToNodeNode(directives.spacing) * 0.35),
      )
    }
    if (resolved.steps.includes('flow-nudge')) {
      const flowLinks = collectLinks(edges).map((l) => ({
        sourcePart: l.sourcePart,
        targetPart: l.targetPart,
      }))
      // Flow nudge among boundary siblings only (same coordinate frame).
      const siblingIds = partIds.filter((id) => {
        const p = parentOf.get(id)
        return !p || p === workingNodes.find(isBoundary)?.id
      })
      enforceFlowLeftToRight(
        nodePatch,
        flowLinks,
        siblingIds,
        spacingToNodeNode(directives.spacing),
      )
      separateAbsoluteOverlaps(
        nodePatch,
        partIds,
        parentOf,
        Math.max(16, spacingToNodeNode(directives.spacing) * 0.35),
      )
    }

    const movedNodes = workingNodes.map((n) => {
      const p = nodePatch[n.id]
      if (!p || p.x == null || p.y == null) return n
      return {
        ...n,
        position: { x: p.x, y: p.y },
        width: p.width ?? n.width,
        height: p.height ?? n.height,
        style: {
          ...n.style,
          width: p.width ?? readSize(n).width,
          height: p.height ?? readSize(n).height,
        },
      }
    })
    const movedById = new Map(movedNodes.map((n) => [n.id, n]))
    const links = collectLinks(edges)
    const boundaryNode = movedNodes.find(isBoundary)
    const portMode = directives.portPlacement
    for (const node of movedNodes) {
      if (node.type && node.type !== 'part') continue
      const h = nodePatch[node.id]?.height ?? readSize(node).height
      const ports = portsOf(node)
      const bySide: Record<PortSide, PartPort[]> = {
        left: [],
        right: [],
        top: [],
        bottom: [],
      }
      for (const p of ports) {
        const side = seedPortSide(
          p,
          node,
          links,
          movedById,
          boundaryNode,
          portMode,
        )
        bySide[side].push(p)
      }
      for (const side of ['left', 'right', 'top', 'bottom'] as PortSide[]) {
        const group = bySide[side]
        const n = Math.max(1, group.length)
        group.forEach((p, i) => {
          const offset =
            side === 'left' || side === 'right'
              ? clampPortOffset(0.35 + ((i + 0.5) / (n + 0.5)) * 0.5, side, h)
              : clampPortOffset(0.15 + ((i + 0.5) / (n + 0.5)) * 0.7, side, h)
          nodePatch[p.id] = { artifactId: p.id, side, offset }
        })
      }
    }
  }

  // Ensure every known port got a patch even if ELK omitted it
  for (const node of workingNodes) {
    if (node.type && node.type !== 'part') continue
    const h = nodePatch[node.id]?.height ?? readSize(node).height
    for (const p of portsOf(node)) {
      if (nodePatch[p.id]) continue
      const side = p.side
      nodePatch[p.id] = {
        artifactId: p.id,
        side,
        offset: clampPortOffset(p.offset, side, h),
      }
    }
  }

  const boundary = workingNodes.find(isBoundary)
  const boundaryId = boundary?.id

  const sizeMap = new Map<string, { width: number; height: number }>()
  const posMap = new Map<string, { x: number; y: number }>()
  for (const node of workingNodes) {
    if (node.type && node.type !== 'part') continue
    const p = nodePatch[node.id]
    sizeMap.set(node.id, {
      width: p?.width ?? readSize(node).width,
      height: p?.height ?? readSize(node).height,
    })
    posMap.set(node.id, {
      x: p?.x ?? node.position.x,
      y: p?.y ?? node.position.y,
    })
  }

  // Final nest-fit + non-overlap after port sizing so parent boxes stay valid.
  if (layoutNodes) {
    const parentOfFinal: ParentOfMap = new Map()
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      parentOfFinal.set(node.id, node.parentId)
    }
    const partIdsFinal = workingNodes
      .filter(
        (n) =>
          !isBoundary(n) &&
          (!n.type || n.type === 'part') &&
          nodePatch[n.id]?.x != null,
      )
      .map((n) => n.id)
    const gap = Math.max(16, spacingToNodeNode(directives.spacing) * 0.35)
    for (let pass = 0; pass < 6; pass++) {
      fitNestedChildrenInParents(nodePatch, parentOfFinal, 24)
      separateAbsoluteOverlaps(nodePatch, partIdsFinal, parentOfFinal, gap)
    }
    fitNestedChildrenInParents(nodePatch, parentOfFinal, 24)
    // Refresh maps after final separation / nest-fit.
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      const p = nodePatch[node.id]
      if (!p) continue
      sizeMap.set(node.id, {
        width: p.width ?? readSize(node).width,
        height: p.height ?? readSize(node).height,
      })
      posMap.set(node.id, {
        x: p.x ?? node.position.x,
        y: p.y ?? node.position.y,
      })
    }
  }

  // Always fit the whitebox around children after placement — including when
  // edges are routed separately (includeEdges: false). Previously this only
  // ran in the ELK-edge path, so AutoLayout left parts/wires outside Car.
  if (boundaryId && layoutNodes) {
    fitBoundaryAroundChildren(
      boundaryId,
      boundary,
      nodePatch,
      sizeMap,
      posMap,
    )
  }

  // Nest-fit once more after boundary shift (absolute separate may have moved kids).
  if (layoutNodes) {
    const parentOfEnd: ParentOfMap = new Map()
    for (const node of workingNodes) {
      if (node.type && node.type !== 'part') continue
      parentOfEnd.set(node.id, node.parentId)
    }
    fitNestedChildrenInParents(nodePatch, parentOfEnd, 24)
    // Projects often store huge default Y (~30000). Prefer origin 0…3000.
    normalizeAutoLayoutCanvas(nodePatch, workingNodes)
  }

  if (!includeEdges) {
    return { nodes: nodePatch }
  }

  const byEdge = new Map<string, ElkExtendedEdge>()
  if (laidOut) collectLaidOutEdges(laidOut, byEdge)

  const routeBounds: Rect = boundaryId
    ? {
        minX: 0,
        minY: 0,
        maxX: sizeMap.get(boundaryId)?.width ?? readSize(boundary!).width,
        maxY: sizeMap.get(boundaryId)?.height ?? readSize(boundary!).height,
      }
    : {
        minX: 0,
        minY: 0,
        maxX: 800,
        maxY: 600,
      }

  const edgePatch: NonNullable<ElkStructureLayoutResult['edges']> = {}
  for (const link of collectLinks(edges)) {
    if (
      boundaryId &&
      (link.sourcePart === boundaryId || link.targetPart === boundaryId)
    ) {
      continue
    }
    const ee = byEdge.get(link.edgeId)
    // Stress yields straight sections (looks like "direct") — always orthogonal
    // after AutoLayout. Redraw may keep ELK bends when they clear obstacles.
    let waypoints =
      layoutNodes || !ee ? [] : waypointsFromElkEdge(ee)

    const srcNode = byId.get(link.sourcePart)
    const tgtNode = byId.get(link.targetPart)
    const srcPort = srcNode && portsOf(srcNode).find((p) => p.id === link.sourcePort)
    const tgtPort = tgtNode && portsOf(tgtNode).find((p) => p.id === link.targetPort)
    const srcSide =
      (nodePatch[link.sourcePort]?.side as PortSide | undefined) ||
      srcPort?.side ||
      'right'
    const tgtSide =
      (nodePatch[link.targetPort]?.side as PortSide | undefined) ||
      tgtPort?.side ||
      'left'
    const srcOff =
      nodePatch[link.sourcePort]?.offset ?? srcPort?.offset ?? 0.5
    const tgtOff =
      nodePatch[link.targetPort]?.offset ?? tgtPort?.offset ?? 0.5

    const start = portPointOnPart(
      posMap.get(link.sourcePart) || { x: 0, y: 0 },
      sizeMap.get(link.sourcePart) || { width: MIN_W, height: MIN_H },
      srcSide,
      srcOff,
    )
    const end = portPointOnPart(
      posMap.get(link.targetPart) || { x: 0, y: 0 },
      sizeMap.get(link.targetPart) || { width: MIN_W, height: MIN_H },
      tgtSide,
      tgtOff,
    )

    const obstacles = childObstacleRects(
      workingNodes,
      sizeMap,
      posMap,
      new Set([link.sourcePart, link.targetPart]),
    )
    const candidate = simplifyOrtho([
      start,
      ...waypoints.map((w) => ({ x: w.x, y: w.y })),
      end,
    ])
    if (
      layoutNodes ||
      candidate.length < 2 ||
      pathCrossesObstaclesMid(candidate, obstacles)
    ) {
      const repaired = routeOrthogonal(start, end, obstacles, routeBounds, {
        // Whitebox: never escape outside the Car / boundary frame.
        strictBounds: !!boundaryId,
      })
      waypoints =
        repaired.length <= 2
          ? []
          : repaired.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
    }

    edgePatch[link.edgeId] = {
      artifactId: link.edgeId,
      routing: 'angular',
      waypoints,
    }
  }
  return { nodes: nodePatch, edges: edgePatch }
}

/**
 * Turn ELK edge waypoints into final angular routes with separation + jumpers.
 * Edges missing from ELK (e.g. boundary↔child) fall back to own A* router.
 */
export function finalizeElkConnectionRoutes(
  nodes: Node[],
  edges: Edge[],
  layout: ElkStructureLayoutResult,
  options?: { separation?: number },
): RoutedConnection[] {
  const separation = options?.separation ?? 5
  const elkIds = new Set(Object.keys(layout.edges || {}))
  const missing = edges.filter((e) => !elkIds.has(e.id))
  const fallback = missing.length
    ? redrawStructureConnections(nodes, missing, layout.nodes, undefined, {
        separation,
        contextEdges: edges,
      })
    : []
  const fallbackById = new Map(fallback.map((r) => [r.id, r]))

  const byId = new Map(nodes.map((n) => [n.id, n]))
  type Draft = {
    id: string
    points: { x: number; y: number }[]
    sourcePort: string
    targetPort: string
  }
  const drafts: Draft[] = []

  for (const edge of edges) {
    const patch = layout.edges?.[edge.id]
    if (!patch) continue
    const sp = portIdFromHandle(edge.sourceHandle)
    const tp = portIdFromHandle(edge.targetHandle)
    if (!sp || !tp) continue
    const srcNode = byId.get(edge.source)
    const tgtNode = byId.get(edge.target)
    if (!srcNode || !tgtNode) continue
    const srcPort = portsOf(srcNode).find((p) => p.id === sp)
    const tgtPort = portsOf(tgtNode).find((p) => p.id === tp)
    const srcSide =
      (layout.nodes[sp]?.side as PortSide | undefined) ||
      srcPort?.side ||
      'right'
    const tgtSide =
      (layout.nodes[tp]?.side as PortSide | undefined) ||
      tgtPort?.side ||
      'left'
    const srcOff = layout.nodes[sp]?.offset ?? srcPort?.offset ?? 0.5
    const tgtOff = layout.nodes[tp]?.offset ?? tgtPort?.offset ?? 0.5
    const srcPos = {
      x: layout.nodes[edge.source]?.x ?? srcNode.position.x,
      y: layout.nodes[edge.source]?.y ?? srcNode.position.y,
    }
    const tgtPos = {
      x: layout.nodes[edge.target]?.x ?? tgtNode.position.x,
      y: layout.nodes[edge.target]?.y ?? tgtNode.position.y,
    }
    const srcSz = {
      width: layout.nodes[edge.source]?.width ?? readSize(srcNode).width,
      height: layout.nodes[edge.source]?.height ?? readSize(srcNode).height,
    }
    const tgtSz = {
      width: layout.nodes[edge.target]?.width ?? readSize(tgtNode).width,
      height: layout.nodes[edge.target]?.height ?? readSize(tgtNode).height,
    }
    const start = portPointOnPart(srcPos, srcSz, srcSide, srcOff)
    const end = portPointOnPart(tgtPos, tgtSz, tgtSide, tgtOff)
    drafts.push({
      id: edge.id,
      sourcePort: sp,
      targetPort: tp,
      points: simplifyOrtho([
        start,
        ...patch.waypoints.map((w) => ({ x: w.x, y: w.y })),
        end,
      ]),
    })
  }

  for (const r of fallback) {
    if (drafts.some((d) => d.id === r.id)) continue
    const edge = edges.find((e) => e.id === r.id)
    const sp = portIdFromHandle(edge?.sourceHandle) || ''
    const tp = portIdFromHandle(edge?.targetHandle) || ''
    const fb = fallbackById.get(r.id)!
    const ends = edge ? null : null
    void ends
    // Rebuild full polyline from waypoints via resolve is heavy; use corners + ports.
    const srcNode = edge && byId.get(edge.source)
    const tgtNode = edge && byId.get(edge.target)
    if (!edge || !srcNode || !tgtNode || !sp || !tp) {
      drafts.push({
        id: r.id,
        sourcePort: sp,
        targetPort: tp,
        points: r.waypoints.map((w) => ({ x: w.x, y: w.y })),
      })
      continue
    }
    const srcPort = portsOf(srcNode).find((p) => p.id === sp)
    const tgtPort = portsOf(tgtNode).find((p) => p.id === tp)
    const srcSide =
      (layout.nodes[sp]?.side as PortSide | undefined) || srcPort?.side || 'right'
    const tgtSide =
      (layout.nodes[tp]?.side as PortSide | undefined) || tgtPort?.side || 'left'
    const start = portPointOnPart(
      {
        x: layout.nodes[edge.source]?.x ?? srcNode.position.x,
        y: layout.nodes[edge.source]?.y ?? srcNode.position.y,
      },
      {
        width: layout.nodes[edge.source]?.width ?? readSize(srcNode).width,
        height: layout.nodes[edge.source]?.height ?? readSize(srcNode).height,
      },
      srcSide,
      layout.nodes[sp]?.offset ?? srcPort?.offset ?? 0.5,
    )
    const end = portPointOnPart(
      {
        x: layout.nodes[edge.target]?.x ?? tgtNode.position.x,
        y: layout.nodes[edge.target]?.y ?? tgtNode.position.y,
      },
      {
        width: layout.nodes[edge.target]?.width ?? readSize(tgtNode).width,
        height: layout.nodes[edge.target]?.height ?? readSize(tgtNode).height,
      },
      tgtSide,
      layout.nodes[tp]?.offset ?? tgtPort?.offset ?? 0.5,
    )
    drafts.push({
      id: r.id,
      sourcePort: sp,
      targetPort: tp,
      points: simplifyOrtho([
        start,
        ...fb.waypoints.map((w) => ({ x: w.x, y: w.y })),
        end,
      ]),
    })
  }

  const separated = separateUnrelatedRoutes(drafts, separation)
  const jumpsById = computeJumpers(separated)
  return separated.map((r) => ({
    id: r.id,
    waypoints: cornersFromFull(r.points),
    jumps: jumpsById.get(r.id) || [],
  }))
}
