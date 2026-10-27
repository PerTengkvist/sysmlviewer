/**
 * Hierarchic (yEd-style) placement: the Sugiyama framework driven through ELK
 * layered, with the pieces that usually make the difference in practice:
 *
 * 1. cycle breaking, 2. layer assignment (network simplex), 3. crossing
 * minimisation (layer sweep), 4. node placement (Brandes–Köpf), 5. orthogonal
 * routing — all inside ELK — plus, on top of it:
 *
 * - port↔port edges so port sides take part in placement,
 * - port candidates (allowed sides per port) and an outer loop that flips
 *   ports toward their peers and keeps the best-scoring run,
 * - a recursive compound graph so nested groups are laid out by ELK itself,
 * - incremental mode (interactive layering / semi-interactive crossing min),
 * - Layout Rules as hard constraints: layers → ELK partitions, precedence →
 *   high-priority constraint edges, in-layer order → position hints,
 * - exact layer bands (parts take 50 % of a band) when layered layout is on.
 */
import ELK, {
  type ElkExtendedEdge,
  type ElkNode,
  type ElkPort,
} from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  clampHierarchicOptions,
  hierarchicDirectionForLayers,
  inferPortFlowRole,
  spacingToDesiredEdgeLength,
  spacingToNodeNode,
  type AutoLayoutDirectives,
  type HierarchicDirection,
  type HierarchicOptions,
} from './autoLayoutOptions'
import {
  fullPolylineFromElkEdge,
  portFromElk,
  seedPortSide,
  type ElkStructureLayoutResult,
} from './elkStructureLayout'
import { sizePartForPorts } from './structureAutoLayout'
import { clampPortOffset } from './portPlacement'
import { normalizeAutoLayoutCanvas } from './layoutNormalize'
import { isVerticalDirection, type LayoutConstraints } from './layoutConstraints'
import { orderWithinLayers, placeInLayerBands } from './layerBands'
import {
  computeLayoutQuality,
  layoutScore,
  type QualityPolyline,
  type QualityRect,
} from './layoutQuality'
import { separateAbsoluteOverlaps, type ParentOfMap } from './flowPlacement'
import { connectedComponents, packComponents } from './componentPacking'

const MIN_W = 140
const MIN_H = 72
const PAD = 48
const CONTAINER_PAD_TOP = 48
const CONTAINER_PAD = 24
const CONSTRAINT_EDGE_PREFIX = '__constraint:'
const VIRTUAL_ROOT = '__hierarchic_root__'

export type HierarchicLayoutResult = ElkStructureLayoutResult & {
  /** ELK runs performed (≤ maxIterations). */
  iterations: number
  /** Score of the kept run (lower is better). */
  score: number
  /** Rule ids ELK could not honour even after the post-pass. */
  violatedRuleIds: string[]
}

type ConnLink = {
  edgeId: string
  sourcePart: string
  targetPart: string
  sourcePort: string | null
  targetPort: string | null
}

function isPartNode(node: Node): boolean {
  return !node.type || node.type === 'part'
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function labelOf(node: Node): string {
  return (node.data as PartNodeData | undefined)?.label || node.id
}

function readSize(n: Node): { width: number; height: number } {
  const w =
    (typeof n.style?.width === 'number' && n.style.width) || n.width || MIN_W
  const h =
    (typeof n.style?.height === 'number' && n.style.height) ||
    n.height ||
    MIN_H
  return { width: Number(w) || MIN_W, height: Number(h) || MIN_H }
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:')
    ? handleId.slice('target:'.length)
    : handleId
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

const SIDE_NORMAL: Record<PortSide, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/** Allowed sides per port ("port candidates"). */
export function portCandidates(
  port: PartPort,
  owner: Node,
  links: ConnLink[],
  byId: Map<string, Node>,
  root: Node | undefined,
  portMode: AutoLayoutDirectives['portPlacement'],
  direction: HierarchicDirection,
): PortSide[] {
  void owner
  void byId
  void root
  if (portMode === 'inputsLeftOutputsRight') {
    const role = inferPortFlowRole(
      port,
      links
        .filter((l) => l.sourcePort && l.targetPort)
        .map((l) => ({
          sourcePort: l.sourcePort as string,
          targetPort: l.targetPort as string,
        })),
    )
    const { inSide, outSide } = flowSides(direction)
    if (role === 'in') return [inSide]
    if (role === 'out') return [outSide]
    return [inSide, outSide]
  }
  return ['left', 'right', 'top', 'bottom']
}

function flowSides(direction: HierarchicDirection): { inSide: PortSide; outSide: PortSide } {
  switch (direction) {
    case 'RIGHT':
      return { inSide: 'left', outSide: 'right' }
    case 'LEFT':
      return { inSide: 'right', outSide: 'left' }
    case 'DOWN':
      return { inSide: 'top', outSide: 'bottom' }
    case 'UP':
      return { inSide: 'bottom', outSide: 'top' }
  }
}

/**
 * Sugiyama seeding: a port used as a connection source faces along the
 * layout direction, a target faces against it. Null when the port is unused.
 */
function flowSide(
  port: PartPort,
  links: ConnLink[],
  direction: HierarchicDirection,
): PortSide | null {
  let asSource = 0
  let asTarget = 0
  for (const l of links) {
    if (l.sourcePort === port.id) asSource += 1
    if (l.targetPort === port.id) asTarget += 1
  }
  if (!asSource && !asTarget) return null
  const { inSide, outSide } = flowSides(direction)
  return asSource >= asTarget ? outSide : inSide
}

/**
 * Side of the root boundary port this port is wired to, when those links
 * outnumber the port's sibling links (otherwise the siblings decide).
 */
function rootPortSideFor(
  port: PartPort,
  allLinks: ConnLink[],
  tree: Tree,
): PortSide | null {
  if (!tree.root) return null
  let boundary = 0
  let siblings = 0
  let side: PortSide | null = null
  for (const l of allLinks) {
    if (l.sourcePort !== port.id && l.targetPort !== port.id) continue
    const otherPart = l.sourcePort === port.id ? l.targetPart : l.sourcePart
    const otherPort = l.sourcePort === port.id ? l.targetPort : l.sourcePort
    if (otherPart === tree.rootId) {
      boundary += 1
      const bp = portsOf(tree.root).find((p) => p.id === otherPort)
      if (bp) side = bp.side
    } else {
      siblings += 1
    }
  }
  return side && boundary >= siblings ? side : null
}

/** Absolute point of a root boundary port on the root rect. */
function rootPortPoint(
  tree: Tree,
  portId: string,
  rootSize: { width: number; height: number },
): { x: number; y: number } | null {
  if (!tree.root) return null
  const bp = portsOf(tree.root).find((p) => p.id === portId)
  if (!bp) return null
  const o = Math.min(1, Math.max(0, bp.offset))
  switch (bp.side) {
    case 'left':
      return { x: 0, y: rootSize.height * o }
    case 'right':
      return { x: rootSize.width, y: rootSize.height * o }
    case 'top':
      return { x: rootSize.width * o, y: 0 }
    case 'bottom':
      return { x: rootSize.width * o, y: rootSize.height }
  }
}

function collectLinks(edges: Edge[], byId: Map<string, Node>): ConnLink[] {
  const out: ConnLink[] = []
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    if (e.source === e.target) continue
    const sp = portIdFromHandle(e.sourceHandle)
    const tp = portIdFromHandle(e.targetHandle)
    if ((sp || '').startsWith('rel-') || (tp || '').startsWith('rel-')) continue
    const srcHas = sp ? portsOf(byId.get(e.source)!).some((p) => p.id === sp) : false
    const tgtHas = tp ? portsOf(byId.get(e.target)!).some((p) => p.id === tp) : false
    out.push({
      edgeId: e.id,
      sourcePart: e.source,
      targetPart: e.target,
      sourcePort: srcHas ? sp : null,
      targetPort: tgtHas ? tp : null,
    })
  }
  return out
}

type Tree = {
  root: Node | undefined
  rootId: string
  byId: Map<string, Node>
  parentOf: Map<string, string>
  childrenOf: Map<string, Node[]>
  depthOf: Map<string, number>
}

function buildTree(nodes: Node[]): Tree {
  const parts = nodes.filter(isPartNode)
  const byId = new Map(parts.map((n) => [n.id, n]))
  const root = parts.find(
    (n) => isBoundary(n) && !(n.parentId && byId.has(n.parentId)),
  )
  const rootId = root?.id ?? VIRTUAL_ROOT
  const parentOf = new Map<string, string>()
  const childrenOf = new Map<string, Node[]>()
  for (const n of parts) {
    if (n === root) continue
    const parent = n.parentId && byId.has(n.parentId) ? n.parentId : rootId
    parentOf.set(n.id, parent)
    childrenOf.set(parent, [...(childrenOf.get(parent) || []), n])
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id))
  }
  const depthOf = new Map<string, number>()
  for (const n of parts) {
    let d = 0
    let cur = parentOf.get(n.id)
    while (cur && cur !== rootId) {
      d += 1
      cur = parentOf.get(cur)
    }
    depthOf.set(n.id, d)
  }
  return { root, rootId, byId, parentOf, childrenOf, depthOf }
}

function lowestCommonAncestor(tree: Tree, a: string, b: string): string {
  const chain = (id: string): string[] => {
    const out: string[] = []
    let cur: string | undefined = id
    while (cur && cur !== tree.rootId) {
      out.push(cur)
      cur = tree.parentOf.get(cur)
    }
    out.push(tree.rootId)
    return out
  }
  const ca = chain(a)
  const cb = new Set(chain(b))
  // Skip the endpoints themselves unless one contains the other.
  for (let i = 0; i < ca.length; i++) {
    const id = ca[i]
    if (cb.has(id)) {
      if (id === a || id === b) {
        // One endpoint is an ancestor of the other: its parent holds the edge.
        return tree.parentOf.get(id) ?? tree.rootId
      }
      return id
    }
  }
  return tree.rootId
}

type RunResult = {
  nodePatch: Record<string, Partial<VisualizationNode>>
  /** Absolute rects per part (root excluded). */
  absRects: Map<string, QualityRect>
  rootSize: { width: number; height: number }
  polylines: QualityPolyline[]
}

type BuildArgs = {
  tree: Tree
  links: ConnLink[]
  sides: Map<string, PortSide>
  sizes: Map<string, { width: number; height: number }>
  opts: HierarchicOptions
  directives: AutoLayoutDirectives
  constraints: LayoutConstraints | undefined
  positionHints: Map<string, { x: number; y: number }>
  /** Restrict the run to these top-level parts (one connected component). */
  topLevel?: Set<string>
  /** Root padding (0 for component sub-runs that are packed afterwards). */
  rootPadding?: number
  /** Containers already laid out by a scoped sub-run: fixed-size leaves here. */
  preLaid?: Map<string, PreLaidContainer>
}

/** Result of a scoped container sub-run (children relative to the container). */
export type PreLaidContainer = {
  patch: Record<string, Partial<VisualizationNode>>
  width: number
  height: number
}

/** Nearest pre-laid container that is `id` itself or one of its ancestors. */
function preLaidAncestor(
  tree: Tree,
  preLaid: Map<string, PreLaidContainer> | undefined,
  id: string,
): string | null {
  if (!preLaid?.size) return null
  let cur: string | undefined = id
  let guard = 0
  while (cur && cur !== tree.rootId && guard++ < 1000) {
    if (preLaid.has(cur)) return cur
    cur = tree.parentOf.get(cur)
  }
  return null
}

function rootLayoutOptions(args: BuildArgs): Record<string, string> {
  const { opts, directives, constraints } = args
  const nodeNode = spacingToNodeNode(directives.spacing)
  const between = spacingToDesiredEdgeLength(directives.spacing)
  const pad = args.rootPadding ?? PAD
  const lo: Record<string, string> = {
    'elk.algorithm': 'layered',
    'elk.direction': opts.direction,
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': `[top=${pad},left=${pad},bottom=${pad},right=${pad}]`,
    'elk.spacing.nodeNode': String(nodeNode),
    'elk.spacing.edgeNode': String(Math.round(nodeNode * 0.3)),
    'elk.spacing.edgeEdge': '12',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(between),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(
      Math.round(between * 0.25),
    ),
    'elk.layered.cycleBreaking.strategy': opts.incremental
      ? 'INTERACTIVE'
      : opts.cycleBreaking,
    'elk.layered.layering.strategy': opts.incremental
      ? 'INTERACTIVE'
      : opts.layering,
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.thoroughness': String(opts.crossingThoroughness),
    'elk.layered.nodePlacement.strategy': opts.nodePlacement,
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.portConstraints': opts.portConstraints,
  }
  if (opts.incremental || args.positionHints.size) {
    lo['elk.layered.crossingMinimization.semiInteractive'] = 'true'
  } else {
    lo['elk.layered.considerModelOrder.strategy'] = 'NODES_AND_EDGES'
  }
  if (opts.incremental) {
    lo['elk.interactiveLayout'] = 'true'
  }
  if (constraints?.enabled && constraints.layerOf.size) {
    lo['elk.partitioning.activate'] = 'true'
  }
  return lo
}

/** Top-level ancestor (direct child of the root) of a part. */
function topLevelAncestor(tree: Tree, id: string): string {
  let cur = id
  let guard = 0
  while (guard++ < 1000) {
    const p = tree.parentOf.get(cur)
    if (!p || p === tree.rootId) return cur
    cur = p
  }
  return cur
}

function buildGraph(args: BuildArgs): ElkNode {
  const { tree, links, sides, sizes, opts, constraints, positionHints } = args
  const inScope = (id: string) =>
    !args.topLevel || args.topLevel.has(topLevelAncestor(tree, id))
  const edgesByContainer = new Map<string, ElkExtendedEdge[]>()
  const addEdge = (container: string, e: ElkExtendedEdge) => {
    edgesByContainer.set(container, [...(edgesByContainer.get(container) || []), e])
  }
  const preLaid = args.preLaid
  // Parts inside a pre-laid container are not ELK nodes here: edges attach to
  // the container instead (and vanish when both ends are inside the same one).
  const mapEnd = (part: string, port: string | null) => {
    const anc = preLaidAncestor(tree, preLaid, part)
    if (anc && anc !== part) return { part: anc, endpoint: anc }
    return { part, endpoint: port ?? part }
  }
  const seen = new Set<string>()
  for (const l of links) {
    if (seen.has(l.edgeId)) continue
    seen.add(l.edgeId)
    if (!inScope(l.sourcePart) || !inScope(l.targetPart)) continue
    const src = mapEnd(l.sourcePart, l.sourcePort)
    const tgt = mapEnd(l.targetPart, l.targetPort)
    if (src.part === tgt.part) continue
    const container = lowestCommonAncestor(tree, src.part, tgt.part)
    addEdge(container, {
      id: l.edgeId,
      sources: [src.endpoint],
      targets: [tgt.endpoint],
    })
  }
  // Precedence rules (every scope) → invisible high-priority edges between siblings.
  if (constraints) {
    let ci = 0
    for (const scope of constraints.scopes) {
      for (const c of scope.precedence) {
        if (!tree.byId.has(c.before) || !tree.byId.has(c.after)) continue
        if (!inScope(c.before) || !inScope(c.after)) continue
        const pa = tree.parentOf.get(c.before)
        const pb = tree.parentOf.get(c.after)
        if (!pa || pa !== pb) continue
        const anc = preLaidAncestor(tree, preLaid, c.before)
        if (anc && anc !== c.before) continue
        addEdge(pa, {
          id: `${CONSTRAINT_EDGE_PREFIX}${ci++}`,
          sources: [c.before],
          targets: [c.after],
          layoutOptions: { 'elk.layered.priority.direction': '10' },
        })
      }
    }
  }

  const toElkPort = (p: PartPort, index: number): ElkPort => ({
    id: p.id,
    width: 8,
    height: 8,
    layoutOptions: {
      'elk.port.side': sideToElk(sides.get(p.id) || p.side),
      ...(opts.portConstraints === 'FIXED_ORDER'
        ? { 'elk.port.index': String(index) }
        : {}),
    },
  })

  const toElkNode = (node: Node): ElkNode => {
    const fixed = preLaid?.get(node.id)
    const kids = fixed ? [] : tree.childrenOf.get(node.id) || []
    const size = fixed
      ? { width: fixed.width, height: fixed.height }
      : sizes.get(node.id) || readSize(node)
    const lo: Record<string, string> = {
      'elk.portConstraints': opts.portConstraints,
    }
    if (kids.length) {
      lo['elk.padding'] =
        `[top=${CONTAINER_PAD_TOP},left=${CONTAINER_PAD},bottom=${CONTAINER_PAD},right=${CONTAINER_PAD}]`
      lo['elk.nodeSize.constraints'] = 'MINIMUM_SIZE'
      lo['elk.nodeSize.minimum'] = `(${size.width},${size.height})`
    }
    const top = tree.parentOf.get(node.id) === tree.rootId
    if (top && constraints?.enabled) {
      const layer = constraints.layerOf.get(node.id)
      if (layer != null) lo['elk.partitioning.partition'] = String(layer)
    }
    const hint = positionHints.get(node.id)
    const pos = hint ?? (opts.incremental ? node.position : undefined)
    if (pos) lo['org.eclipse.elk.position'] = `(${pos.x},${pos.y})`
    return {
      id: node.id,
      width: size.width,
      height: size.height,
      ...(pos ? { x: pos.x, y: pos.y } : {}),
      ports: portsOf(node).map(toElkPort),
      children: kids.map(toElkNode),
      edges: edgesByContainer.get(node.id) || [],
      layoutOptions: lo,
    }
  }

  const topLevel = (tree.childrenOf.get(tree.rootId) || [])
    .filter((n) => !args.topLevel || args.topLevel.has(n.id))
    .map(toElkNode)
  const rootOpts = rootLayoutOptions(args)
  if (tree.root) {
    return {
      id: tree.root.id,
      children: topLevel,
      edges: edgesByContainer.get(tree.rootId) || [],
      layoutOptions: rootOpts,
    }
  }
  return {
    id: VIRTUAL_ROOT,
    children: topLevel,
    edges: edgesByContainer.get(VIRTUAL_ROOT) || [],
    layoutOptions: rootOpts,
  }
}

function extractRun(
  laid: ElkNode,
  tree: Tree,
  links: ConnLink[],
): RunResult {
  const nodePatch: Record<string, Partial<VisualizationNode>> = {}
  const absRects = new Map<string, QualityRect>()
  const polylines: QualityPolyline[] = []
  const linkByEdge = new Map(links.map((l) => [l.edgeId, l]))

  const walk = (en: ElkNode, offset: { x: number; y: number }, isRoot: boolean) => {
    const w = en.width ?? MIN_W
    const h = en.height ?? MIN_H
    const abs = isRoot
      ? offset
      : { x: offset.x + (en.x ?? 0), y: offset.y + (en.y ?? 0) }
    if (!isRoot) {
      nodePatch[en.id] = {
        artifactId: en.id,
        x: en.x ?? 0,
        y: en.y ?? 0,
        width: w,
        height: h,
      }
      absRects.set(en.id, {
        id: en.id,
        minX: abs.x,
        minY: abs.y,
        maxX: abs.x + w,
        maxY: abs.y + h,
      })
    }
    for (const ep of en.ports || []) {
      const placed = portFromElk(ep, w, h)
      nodePatch[ep.id] = {
        artifactId: ep.id,
        side: placed.side,
        offset: placed.offset,
      }
    }
    for (const e of en.edges || []) {
      if (e.id.startsWith(CONSTRAINT_EDGE_PREFIX)) continue
      const l = linkByEdge.get(e.id)
      const pts = fullPolylineFromElkEdge(e).map((p) => ({
        x: p.x + abs.x,
        y: p.y + abs.y,
      }))
      if (pts.length >= 2) {
        polylines.push({
          id: e.id,
          points: pts,
          endpoints: l ? [l.sourcePart, l.targetPart] : ['', ''],
        })
      }
    }
    for (const c of en.children || []) walk(c, abs, false)
  }
  walk(laid, { x: 0, y: 0 }, true)
  void tree
  return {
    nodePatch,
    absRects,
    rootSize: { width: laid.width ?? 0, height: laid.height ?? 0 },
    polylines,
  }
}

function scoreRun(run: RunResult, tree: Tree): number {
  const parentOf = new Map<string, string | undefined>()
  for (const [id, p] of tree.parentOf) parentOf.set(id, p === tree.rootId ? undefined : p)
  const metrics = computeLayoutQuality([...run.absRects.values()], run.polylines, {
    parentOf,
  })
  return layoutScore(metrics)
}

/** Flip ports toward their peers within the allowed candidates. */
function proposeSides(
  run: RunResult,
  tree: Tree,
  links: ConnLink[],
  sides: Map<string, PortSide>,
  candidates: Map<string, PortSide[]>,
): { next: Map<string, PortSide>; changed: number } {
  const next = new Map(sides)
  let changed = 0
  const centre = (id: string) => {
    const r = run.absRects.get(id)
    if (!r) return null
    return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 }
  }
  const peerPoint = (l: ConnLink, portId: string) => {
    const peerId = l.sourcePort === portId ? l.targetPart : l.sourcePart
    if (peerId === tree.rootId) {
      const peerPort = l.sourcePort === portId ? l.targetPort : l.sourcePort
      return peerPort ? rootPortPoint(tree, peerPort, run.rootSize) : null
    }
    return centre(peerId)
  }
  for (const node of tree.byId.values()) {
    if (node === tree.root) continue
    const own = centre(node.id)
    if (!own) continue
    for (const p of portsOf(node)) {
      const cands = candidates.get(p.id) || []
      if (cands.length <= 1) continue
      let vx = 0
      let vy = 0
      let n = 0
      for (const l of links) {
        if (l.sourcePort !== p.id && l.targetPort !== p.id) continue
        const peer = peerPoint(l, p.id)
        if (!peer) continue
        vx += peer.x - own.x
        vy += peer.y - own.y
        n += 1
      }
      if (!n) continue
      let best: PortSide = sides.get(p.id) || p.side
      let bestDot = Number.NEGATIVE_INFINITY
      for (const c of cands) {
        const nrm = SIDE_NORMAL[c]
        const dot = nrm.x * vx + nrm.y * vy
        if (dot > bestDot + 1e-6) {
          bestDot = dot
          best = c
        }
      }
      if (best !== (sides.get(p.id) || p.side)) {
        next.set(p.id, best)
        changed += 1
      }
    }
  }
  return { next, changed }
}

function axisAlong(direction: HierarchicDirection): 'x' | 'y' {
  return direction === 'RIGHT' || direction === 'LEFT' ? 'x' : 'y'
}

/**
 * Snap top-level parts into exact layer bands (layered layout enabled).
 * Uses ELK's order along the perpendicular axis as a hint.
 */
function snapToBands(
  run: RunResult,
  tree: Tree,
  constraints: LayoutConstraints,
  gap: number,
): void {
  const top = tree.childrenOf.get(tree.rootId) || []
  const layerOf = new Map<string, number>()
  for (const n of top) {
    const li = constraints.layerOf.get(n.id)
    if (li != null) layerOf.set(n.id, li)
  }
  if (!layerOf.size) return
  const vertical = isVerticalDirection(constraints.direction)
  const hint = new Map<string, number>()
  for (const n of top) {
    const p = run.nodePatch[n.id]
    if (p?.x == null || p.y == null) continue
    hint.set(n.id, vertical ? p.x : p.y)
  }
  const order = orderWithinLayers(layerOf, constraints.orderInLayer, hint)
  const boxes = top
    .filter((n) => layerOf.has(n.id))
    .map((n) => ({
      id: n.id,
      w: run.nodePatch[n.id]?.width ?? MIN_W,
      h: run.nodePatch[n.id]?.height ?? MIN_H,
    }))
  const bands = placeInLayerBands({
    direction: constraints.direction,
    layerCount: constraints.layerCount,
    layerOf,
    order,
    boxes,
    gap,
    origin: { x: PAD, y: PAD },
  })
  for (const [id, pos] of Object.entries(bands.positions)) {
    run.nodePatch[id] = { ...run.nodePatch[id], x: pos.x, y: pos.y }
  }
  run.rootSize = {
    width: bands.width + 2 * PAD,
    height: bands.height + 2 * PAD,
  }
  refreshAbsRects(run, tree)
}

function refreshAbsRects(run: RunResult, tree: Tree): void {
  const absOf = (id: string): { x: number; y: number } => {
    const p = run.nodePatch[id]
    const parent = tree.parentOf.get(id)
    const base =
      parent && parent !== tree.rootId ? absOf(parent) : { x: 0, y: 0 }
    return { x: base.x + (p?.x ?? 0), y: base.y + (p?.y ?? 0) }
  }
  for (const id of run.absRects.keys()) {
    const a = absOf(id)
    const p = run.nodePatch[id]
    run.absRects.set(id, {
      id,
      minX: a.x,
      minY: a.y,
      maxX: a.x + (p?.width ?? MIN_W),
      maxY: a.y + (p?.height ?? MIN_H),
    })
  }
}

/**
 * Post-pass: enforce in-layer order / precedence among top-level siblings by
 * swapping coordinates of violating pairs (ELK usually already honours them).
 */
function enforceOrderConstraints(
  run: RunResult,
  tree: Tree,
  constraints: LayoutConstraints,
  direction: HierarchicDirection,
  gap: number,
): string[] {
  const topIds = new Set((tree.childrenOf.get(tree.rootId) || []).map((n) => n.id))
  const along = axisAlong(direction)
  const perp: 'x' | 'y' = along === 'x' ? 'y' : 'x'
  const reversedAlong = direction === 'LEFT' || direction === 'UP'
  const violated = new Set<string>()
  const centreOf = (id: string, axis: 'x' | 'y') => {
    const p = run.nodePatch[id]
    if (!p || p.x == null || p.y == null) return null
    return axis === 'x'
      ? p.x + (p.width ?? MIN_W) / 2
      : p.y + (p.height ?? MIN_H) / 2
  }
  const swap = (a: string, b: string, axis: 'x' | 'y') => {
    const pa = run.nodePatch[a]
    const pb = run.nodePatch[b]
    const ca = centreOf(a, axis)!
    const cb = centreOf(b, axis)!
    const sizeA = axis === 'x' ? (pa.width ?? MIN_W) : (pa.height ?? MIN_H)
    const sizeB = axis === 'x' ? (pb.width ?? MIN_W) : (pb.height ?? MIN_H)
    run.nodePatch[a] = { ...pa, [axis]: cb - sizeA / 2 }
    run.nodePatch[b] = { ...pb, [axis]: ca - sizeB / 2 }
  }
  for (let pass = 0; pass < 3; pass++) {
    let swapped = false
    for (const c of constraints.orderInLayer) {
      if (!topIds.has(c.before) || !topIds.has(c.after)) continue
      const a = centreOf(c.before, perp)
      const b = centreOf(c.after, perp)
      if (a == null || b == null) continue
      if (a > b) {
        swap(c.before, c.after, perp)
        swapped = true
        violated.add(c.ruleId)
      }
    }
    for (const c of constraints.precedence) {
      if (!topIds.has(c.before) || !topIds.has(c.after)) continue
      const a = centreOf(c.before, along)
      const b = centreOf(c.after, along)
      if (a == null || b == null) continue
      const bad = reversedAlong ? a < b : a > b
      if (bad) {
        swap(c.before, c.after, along)
        swapped = true
        violated.add(c.ruleId)
      }
    }
    if (!swapped) break
  }
  if (violated.size) {
    const parentOf: ParentOfMap = new Map()
    for (const id of topIds) parentOf.set(id, undefined)
    separateAbsoluteOverlaps(run.nodePatch, [...topIds], parentOf, gap)
    refreshAbsRects(run, tree)
  }
  // Re-check what is still violated after the swaps.
  const still: string[] = []
  for (const c of constraints.orderInLayer) {
    if (!topIds.has(c.before) || !topIds.has(c.after)) continue
    const a = centreOf(c.before, perp)
    const b = centreOf(c.after, perp)
    if (a != null && b != null && a > b) still.push(c.ruleId)
  }
  for (const c of constraints.precedence) {
    if (!topIds.has(c.before) || !topIds.has(c.after)) continue
    const a = centreOf(c.before, along)
    const b = centreOf(c.after, along)
    if (a == null || b == null) continue
    if (reversedAlong ? a < b : a > b) still.push(c.ruleId)
  }
  return [...new Set(still)].sort()
}

/** Position hints for in-layer order constraints (semi-interactive sweep). */
function orderHints(
  tree: Tree,
  constraints: LayoutConstraints | undefined,
  direction: HierarchicDirection,
  sizes: Map<string, { width: number; height: number }>,
  preLaid?: Map<string, PreLaidContainer>,
): Map<string, { x: number; y: number }> {
  const hints = new Map<string, { x: number; y: number }>()
  if (!constraints) return hints
  for (const scope of constraints.scopes) {
    if (!scope.orderInLayer.length) continue
    const containerId = scope.containerId ?? tree.rootId
    if (scope.containerId && preLaid?.has(scope.containerId)) continue
    const memberIds = new Set(
      (tree.childrenOf.get(containerId) || []).map((n) => n.id),
    )
    const involved = new Set<string>()
    const indeg = new Map<string, number>()
    const adj = new Map<string, string[]>()
    for (const c of scope.orderInLayer) {
      if (!memberIds.has(c.before) || !memberIds.has(c.after)) continue
      involved.add(c.before)
      involved.add(c.after)
      adj.set(c.before, [...(adj.get(c.before) || []), c.after])
      indeg.set(c.after, (indeg.get(c.after) || 0) + 1)
      if (!indeg.has(c.before)) indeg.set(c.before, 0)
    }
    const ready = [...involved].filter((id) => !indeg.get(id)).sort()
    const rank = new Map<string, number>()
    let r = 0
    while (ready.length) {
      const u = ready.shift()!
      rank.set(u, r++)
      for (const v of adj.get(u) || []) {
        const d = (indeg.get(v) || 0) - 1
        indeg.set(v, d)
        if (d === 0) {
          ready.push(v)
          ready.sort()
        }
      }
    }
    const scopeDirection = scope.containerId
      ? hierarchicDirectionForLayers(scope.direction)
      : direction
    const perp = axisAlong(scopeDirection) === 'x' ? 'y' : 'x'
    let cursor = 0
    for (const id of [...rank.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!)) {
      const sz = sizes.get(id) || { width: MIN_W, height: MIN_H }
      hints.set(id, perp === 'x' ? { x: cursor, y: 0 } : { x: 0, y: cursor })
      cursor += (perp === 'x' ? sz.width : sz.height) + 1000
    }
  }
  return hints
}

/** Ids of all parts below `containerId` (any depth). */
function descendantIds(tree: Tree, containerId: string): string[] {
  const out: string[] = []
  const stack = [...(tree.childrenOf.get(containerId) || [])]
  while (stack.length) {
    const n = stack.pop()!
    out.push(n.id)
    stack.push(...(tree.childrenOf.get(n.id) || []))
  }
  return out
}

function isDescendant(tree: Tree, id: string, ancestor: string): boolean {
  let cur = tree.parentOf.get(id)
  let guard = 0
  while (cur && cur !== tree.rootId && guard++ < 1000) {
    if (cur === ancestor) return true
    cur = tree.parentOf.get(cur)
  }
  return false
}

/**
 * Lay out one scoped container as its own hierarchic run (the container is
 * the boundary, its scope becomes the root scope, nested scopes follow).
 */
async function layoutScopedContainer(
  containerId: string,
  tree: Tree,
  nodes: Node[],
  edges: Edge[],
  directives: AutoLayoutDirectives,
  constraints: LayoutConstraints,
  deps: { layout?: (graph: ElkNode) => Promise<ElkNode> },
): Promise<PreLaidContainer> {
  const container = tree.byId.get(containerId)!
  const inside = new Set(descendantIds(tree, containerId))
  const subNodes: Node[] = [
    {
      ...container,
      parentId: undefined,
      data: { ...(container.data as PartNodeData), isBoundary: true },
    },
    ...nodes.filter((n) => inside.has(n.id)),
  ]
  const subEdges = edges.filter(
    (e) =>
      (inside.has(e.source) || e.source === containerId) &&
      (inside.has(e.target) || e.target === containerId),
  )
  const scope = constraints.scopes.find((s) => s.containerId === containerId)!
  const subConstraints: LayoutConstraints = {
    ...constraints,
    direction: scope.direction,
    layerCount: scope.layerCount,
    layerNames: scope.layerNames,
    layerOf: scope.layerOf,
    explicit: scope.explicit,
    autoAssigned: scope.autoAssigned,
    precedence: scope.precedence,
    orderInLayer: scope.orderInLayer,
    scopes: [
      { ...scope, containerId: null },
      ...constraints.scopes.filter(
        (s) => s.containerId && s.containerId !== containerId && isDescendant(tree, s.containerId, containerId),
      ),
    ],
  }
  const r = await layoutHierarchic(
    subNodes,
    subEdges,
    {
      ...directives,
      hierarchic: {
        ...clampHierarchicOptions(directives.hierarchic),
        direction: hierarchicDirectionForLayers(scope.direction),
        incremental: false,
      },
      constraints: subConstraints,
    },
    deps,
  )
  const root = r.nodes[containerId]
  const patch: Record<string, Partial<VisualizationNode>> = {}
  for (const [id, v] of Object.entries(r.nodes)) {
    if (id === containerId) continue
    patch[id] = v
  }
  return {
    patch,
    width: root?.width ?? readSize(container).width,
    height: root?.height ?? readSize(container).height,
  }
}

const elk = new ELK()

export async function layoutHierarchic(
  nodes: Node[],
  edges: Edge[],
  directives: AutoLayoutDirectives,
  deps: { layout?: (graph: ElkNode) => Promise<ElkNode> } = {},
): Promise<HierarchicLayoutResult> {
  const opts = clampHierarchicOptions(directives.hierarchic)
  const constraints = directives.constraints
  const tree = buildTree(nodes)
  // Links to the root boundary's own ports only steer port candidates; elkjs
  // cannot route edges to root-graph ports, so they stay out of the graph.
  const allLinks = collectLinks(edges, tree.byId)
  const links = allLinks.filter(
    (l) => l.sourcePart !== tree.rootId && l.targetPart !== tree.rootId,
  )
  const portMode = directives.portPlacement
  const layout = deps.layout ?? ((g: ElkNode) => elk.layout(g))

  // Port candidates and initial sides.
  const candidates = new Map<string, PortSide[]>()
  const sides = new Map<string, PortSide>()
  const seedLinks = links
    .filter((l) => l.sourcePort && l.targetPort)
    .map((l) => ({
      edgeId: l.edgeId,
      sourcePart: l.sourcePart,
      targetPart: l.targetPart,
      sourcePort: l.sourcePort as string,
      targetPort: l.targetPort as string,
    }))
  for (const node of tree.byId.values()) {
    for (const p of portsOf(node)) {
      if (node === tree.root) {
        candidates.set(p.id, [p.side])
        sides.set(p.id, p.side)
        continue
      }
      const cands = portCandidates(
        p,
        node,
        allLinks,
        tree.byId,
        tree.root,
        portMode,
        opts.direction,
      )
      candidates.set(p.id, cands)
      const boundarySide = rootPortSideFor(p, allLinks, tree)
      const flow = flowSide(p, links, opts.direction)
      const seeded =
        boundarySide ??
        flow ??
        seedPortSide(p, node, seedLinks, tree.byId, tree.root, portMode)
      sides.set(p.id, cands.includes(seeded) ? seeded : cands[0])
    }
  }

  // Scoped containers (layered layout inside a part): lay them out first,
  // deepest scopes handled by the recursion, then treat them as fixed leaves.
  const preLaid = new Map<string, PreLaidContainer>()
  if (constraints) {
    const scoped = constraints.scopes.filter(
      (sc) => sc.containerId && sc.layerCount > 0 && tree.byId.has(sc.containerId),
    )
    const scopedIds = new Set(scoped.map((sc) => sc.containerId as string))
    for (const sc of scoped) {
      const id = sc.containerId as string
      const nestedInScoped = [...scopedIds].some(
        (other) => other !== id && isDescendant(tree, id, other),
      )
      if (nestedInScoped) continue
      preLaid.set(
        id,
        await layoutScopedContainer(id, tree, nodes, edges, directives, constraints, deps),
      )
    }
  }

  const sizeFor = (node: Node, current: Map<string, PortSide>) => {
    const fixed = preLaid.get(node.id)
    if (fixed) return { width: fixed.width, height: fixed.height }
    const ports = portsOf(node).map((p) => ({
      name: p.name,
      side: current.get(p.id) || p.side,
    }))
    const fitted = sizePartForPorts(
      labelOf(node),
      ports.length ? ports : [{ name: '·', side: 'right' }],
    )
    // Containers get their size from ELK (children + padding); a stale large
    // size from an earlier layout must not become their minimum.
    if ((tree.childrenOf.get(node.id) || []).length) return fitted
    const base = readSize(node)
    return {
      width: Math.max(fitted.width, base.width),
      height: Math.max(fitted.height, base.height),
    }
  }
  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of tree.byId.values()) {
    if (node === tree.root) continue
    sizes.set(node.id, sizeFor(node, sides))
  }
  const positionHints = orderHints(tree, constraints, opts.direction, sizes, preLaid)
  const gap = spacingToNodeNode(directives.spacing)

  // Disconnected components are laid out separately and packed (yEd-style
  // component arrangement) unless layers must be shared across the diagram.
  const topIds = (tree.childrenOf.get(tree.rootId) || []).map((n) => n.id)
  const topLinks: { a: string; b: string }[] = []
  for (const l of links) {
    topLinks.push({
      a: topLevelAncestor(tree, l.sourcePart),
      b: topLevelAncestor(tree, l.targetPart),
    })
  }
  for (const c of constraints?.precedence || []) {
    if (tree.byId.has(c.before) && tree.byId.has(c.after)) {
      topLinks.push({
        a: topLevelAncestor(tree, c.before),
        b: topLevelAncestor(tree, c.after),
      })
    }
  }
  for (const c of constraints?.orderInLayer || []) {
    if (tree.byId.has(c.before) && tree.byId.has(c.after)) {
      topLinks.push({
        a: topLevelAncestor(tree, c.before),
        b: topLevelAncestor(tree, c.after),
      })
    }
  }
  // Incremental mode keeps one graph so ELK's interactive phases see the
  // whole current arrangement.
  const components =
    (constraints?.enabled && constraints.layerOf.size) || opts.incremental
      ? [topIds]
      : connectedComponents(topIds, topLinks)

  const runOnce = async (current: Map<string, PortSide>): Promise<RunResult> => {
    if (components.length <= 1) {
      const laid = await layout(
        buildGraph({
          tree,
          links,
          sides: current,
          sizes,
          opts,
          directives,
          constraints,
          positionHints,
          preLaid,
        }),
      )
      return extractRun(laid, tree, links)
    }
    const subRuns: { ids: string[]; run: RunResult }[] = []
    for (const ids of components) {
      const single = ids.length === 1 && !(tree.childrenOf.get(ids[0]) || []).length
      if (single) {
        const id = ids[0]
        const sz = sizes.get(id) || readSize(tree.byId.get(id)!)
        const nodePatch: Record<string, Partial<VisualizationNode>> = {
          [id]: { artifactId: id, x: 0, y: 0, width: sz.width, height: sz.height },
        }
        subRuns.push({
          ids,
          run: {
            nodePatch,
            absRects: new Map([
              [id, { id, minX: 0, minY: 0, maxX: sz.width, maxY: sz.height }],
            ]),
            rootSize: { width: sz.width, height: sz.height },
            polylines: [],
          },
        })
        continue
      }
      const laid = await layout(
        buildGraph({
          tree,
          links,
          sides: current,
          sizes,
          opts,
          directives,
          constraints,
          positionHints,
          preLaid,
          topLevel: new Set(ids),
          rootPadding: 0,
        }),
      )
      subRuns.push({ ids, run: extractRun(laid, tree, links) })
    }
    const packed = packComponents(
      subRuns.map((s, i) => ({
        id: String(i),
        w: s.run.rootSize.width,
        h: s.run.rootSize.height,
      })),
      { aspectRatio: directives.aspectRatio || 1, gap },
    )
    const merged: RunResult = {
      nodePatch: {},
      absRects: new Map(),
      rootSize: { width: packed.width + 2 * PAD, height: packed.height + 2 * PAD },
      polylines: [],
    }
    subRuns.forEach((s, i) => {
      const off = packed.positions[String(i)]
      const dx = off.x + PAD
      const dy = off.y + PAD
      const top = new Set(s.ids)
      for (const [id, p] of Object.entries(s.run.nodePatch)) {
        merged.nodePatch[id] =
          top.has(id) && p.x != null && p.y != null
            ? { ...p, x: p.x + dx, y: p.y + dy }
            : p
      }
      for (const [id, r] of s.run.absRects) {
        merged.absRects.set(id, {
          id,
          minX: r.minX + dx,
          minY: r.minY + dy,
          maxX: r.maxX + dx,
          maxY: r.maxY + dy,
        })
      }
      for (const pl of s.run.polylines) {
        merged.polylines.push({
          ...pl,
          points: pl.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
        })
      }
    })
    return merged
  }

  let best: { run: RunResult; score: number } | null = null
  let iterations = 0
  let current = sides
  for (let iter = 0; iter < opts.maxIterations; iter++) {
    // Re-fit sizes for the current sides (port labels move between sides).
    for (const node of tree.byId.values()) {
      if (node === tree.root) continue
      sizes.set(node.id, sizeFor(node, current))
    }
    const run = await runOnce(current)
    iterations += 1
    const score = scoreRun(run, tree)
    if (!best || score < best.score) best = { run, score }
    const { next, changed } = proposeSides(run, tree, allLinks, current, candidates)
    if (!changed) break
    current = next
  }
  const run = best!.run

  let violatedRuleIds: string[] = []
  if (constraints) {
    if (constraints.enabled && constraints.layerOf.size) {
      snapToBands(run, tree, constraints, gap)
    }
    violatedRuleIds = enforceOrderConstraints(run, tree, constraints, opts.direction, gap)
  }

  // Children of scoped containers come from their sub-runs (relative coords).
  const nodePatch = run.nodePatch
  for (const [containerId, fixed] of preLaid) {
    for (const [id, v] of Object.entries(fixed.patch)) {
      if (id === containerId) continue
      nodePatch[id] = v
    }
    if (nodePatch[containerId]) {
      nodePatch[containerId] = {
        ...nodePatch[containerId],
        width: fixed.width,
        height: fixed.height,
      }
    }
  }

  // Root boundary: keep position, adopt computed size (grow to content).
  if (tree.root) {
    let maxX = 0
    let maxY = 0
    for (const n of tree.childrenOf.get(tree.rootId) || []) {
      const p = nodePatch[n.id]
      if (!p || p.x == null || p.y == null) continue
      maxX = Math.max(maxX, p.x + (p.width ?? MIN_W))
      maxY = Math.max(maxY, p.y + (p.height ?? MIN_H))
    }
    nodePatch[tree.root.id] = {
      artifactId: tree.root.id,
      x: tree.root.position.x,
      y: tree.root.position.y,
      width: Math.max(420, run.rootSize.width, maxX + PAD),
      height: Math.max(260, run.rootSize.height, maxY + PAD),
    }
  }

  // Ports ELK did not report (e.g. no edges): keep side, clamp offset.
  for (const node of tree.byId.values()) {
    const h = nodePatch[node.id]?.height ?? readSize(node).height
    for (const p of portsOf(node)) {
      if (nodePatch[p.id]) continue
      const side = current.get(p.id) || p.side
      nodePatch[p.id] = {
        artifactId: p.id,
        side,
        offset: clampPortOffset(p.offset, side, h),
      }
    }
  }

  normalizeAutoLayoutCanvas(nodePatch, nodes)
  return {
    nodes: nodePatch,
    iterations,
    score: best!.score,
    violatedRuleIds,
  }
}
