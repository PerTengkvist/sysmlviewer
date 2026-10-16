/**
 * Adaptive algorithm policy for the Advanced "custom" placement pipeline.
 * Chooses ELK algorithm + spacing scale per nest scope from metrics × weights.
 */
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  inferPortFlowRole,
  SUGGESTED_LEVEL_WEIGHTS,
  type LayoutLevel,
  type LayoutWeights,
  type LevelWeights,
} from './autoLayoutOptions'
import {
  groupChildrenByParent,
  maxNestDepth,
  nestDepth,
} from './nestBottomUp'

/** Same set as PipelineElkAlgorithm (kept local to avoid import cycles). */
export type AdaptiveElkAlgorithm =
  | 'stress'
  | 'layered'
  | 'force'
  | 'rectpacking'

export type ScopeMetrics = {
  parentId: string
  childCount: number
  edgeCount: number
  density: number
  avgPorts: number
  maxPorts: number
  ioSkew: number
  isDagish: boolean
}

export type ScopePlan = {
  parentId: string
  level: LayoutLevel
  metrics: ScopeMetrics
  weights: LayoutWeights
  algorithm: AdaptiveElkAlgorithm
  useFixedSidePorts: boolean
  spacingScale: number
  corridorPad: number
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function isPartNode(node: Node): boolean {
  return !node.type || node.type === 'part'
}

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

/** Suggested weights for a nest band (leaf / mid / root). */
export function suggestWeightsForLevel(level: LayoutLevel): LayoutWeights {
  return { ...SUGGESTED_LEVEL_WEIGHTS[level] }
}

/**
 * Classify a parent: boundary → root; deepest nest band → leaf; else mid.
 * Depth is nestDepth(parent); maxDepth is max over all non-boundary parts.
 */
export function levelForParent(
  depth: number,
  maxDepth: number,
  isBoundaryParent: boolean,
): LayoutLevel {
  if (isBoundaryParent || depth <= 0) return 'root'
  if (maxDepth <= 1) return 'leaf'
  if (depth >= maxDepth - 1) return 'leaf'
  return 'mid'
}

function hasCycle(childIds: string[], adj: Map<string, string[]>): boolean {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const id of childIds) color.set(id, WHITE)

  const visit = (u: string): boolean => {
    color.set(u, GRAY)
    for (const v of adj.get(u) || []) {
      if (!color.has(v)) continue
      const c = color.get(v)
      if (c === GRAY) return true
      if (c === WHITE && visit(v)) return true
    }
    color.set(u, BLACK)
    return false
  }

  for (const id of childIds) {
    if (color.get(id) === WHITE && visit(id)) return true
  }
  return false
}

/**
 * Metrics for laying out direct children of `parentId` (plus edges to parent).
 */
export function collectScopeMetrics(
  parentId: string,
  nodes: Node[],
  edges: Edge[],
): ScopeMetrics {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const childIds = (groupChildrenByParent(nodes).get(parentId) || []).filter(
    (id) => byId.has(id),
  )
  const childSet = new Set(childIds)

  type Link = { sourcePart: string; targetPart: string; sourcePort: string; targetPort: string }
  const scopeLinks: Link[] = []
  const adj = new Map<string, string[]>()
  for (const id of childIds) adj.set(id, [])

  for (const e of edges) {
    const sp = portIdFromHandle(e.sourceHandle)
    const tp = portIdFromHandle(e.targetHandle)
    if (!sp || !tp) continue
    const a = e.source
    const b = e.target
    const aIn = childSet.has(a)
    const bIn = childSet.has(b)
    if (!aIn && !bIn) continue
    // Count edges between children, or child ↔ parent.
    if ((aIn && bIn) || a === parentId || b === parentId) {
      scopeLinks.push({
        sourcePart: a,
        targetPart: b,
        sourcePort: sp,
        targetPort: tp,
      })
    }
    if (aIn && bIn && a !== b) {
      adj.get(a)!.push(b)
    }
  }

  let portSum = 0
  let maxPorts = 0
  let ioNamed = 0
  let portTotal = 0
  const roleLinks = scopeLinks.map((l) => ({
    sourcePort: l.sourcePort,
    targetPort: l.targetPort,
  }))

  for (const id of childIds) {
    const ports = portsOf(byId.get(id)!)
    portSum += ports.length
    maxPorts = Math.max(maxPorts, ports.length)
    for (const p of ports) {
      portTotal += 1
      const role = inferPortFlowRole(
        { id: p.id, name: p.name },
        roleLinks,
      )
      if (role === 'in' || role === 'out') ioNamed += 1
    }
  }

  const n = childIds.length
  const eCount = scopeLinks.length
  const density = eCount / Math.max(n, 1)
  const avgPorts = n > 0 ? portSum / n : 0
  const ioSkew = portTotal > 0 ? ioNamed / portTotal : 0
  const isDagish = n > 0 && eCount > 0 && !hasCycle(childIds, adj)

  return {
    parentId,
    childCount: n,
    edgeCount: eCount,
    density,
    avgPorts,
    maxPorts,
    ioSkew,
    isDagish,
  }
}

/** Whether FIXED_SIDE port constraints should be used for this scope. */
export function useFixedSidePorts(weights: LayoutWeights): boolean {
  return weights.flowDirection >= 0.5 || weights.portClarity >= 0.7
}

/**
 * Spacing multiplier from weights.
 * Higher bendMinimization / portClarity → larger gaps; higher compactness → smaller.
 */
export function spacingScale(weights: LayoutWeights): number {
  const expand =
    1 +
    weights.bendMinimization * 0.45 +
    weights.portClarity * 0.25 -
    weights.compactness * 0.35
  return Math.min(1.8, Math.max(0.65, expand))
}

/** Extra nest padding (px) for routing corridors inside a parent. */
export function corridorPad(
  weights: LayoutWeights,
  basePad = 24,
): number {
  return Math.round(
    basePad *
      (1 +
        weights.bendMinimization * 0.55 +
        weights.portClarity * 0.35 -
        weights.compactness * 0.2),
  )
}

/**
 * Pick an ELK algorithm from scope metrics and user weights.
 */
export function chooseElkAlgorithm(
  metrics: ScopeMetrics,
  weights: LayoutWeights,
): AdaptiveElkAlgorithm {
  const { childCount: n, edgeCount: e, density, ioSkew, isDagish } = metrics

  if (n <= 1 || e === 0) return 'rectpacking'

  const scores: Record<AdaptiveElkAlgorithm, number> = {
    stress:
      weights.connectionAwareness * (0.5 + 0.5 * Math.min(density, 2) / 2) +
      (1 - weights.flowDirection) * 0.3 +
      (1 - weights.compactness) * 0.1,
    layered:
      weights.flowDirection * (0.4 + 0.4 * ioSkew) +
      weights.bendMinimization * 0.4 +
      (isDagish ? 0.25 : 0) +
      (1 - weights.connectionAwareness) * 0.1,
    force:
      weights.connectionAwareness * 0.5 +
      (n >= 6 ? 0.25 : 0) +
      (1 - weights.flowDirection) * 0.15,
    rectpacking:
      weights.compactness * (1 - Math.min(density, 1)) +
      (density < 0.25 ? 0.15 : 0),
  }

  let best: AdaptiveElkAlgorithm = 'stress'
  let bestScore = -Infinity
  for (const algo of Object.keys(scores) as AdaptiveElkAlgorithm[]) {
    if (scores[algo] > bestScore) {
      bestScore = scores[algo]
      best = algo
    }
  }
  return best
}

export function planScope(
  parentId: string,
  nodes: Node[],
  edges: Edge[],
  levelWeights: LevelWeights,
  opts: { isBoundary?: boolean; depth?: number; maxDepth?: number } = {},
): ScopePlan {
  const metrics = collectScopeMetrics(parentId, nodes, edges)
  const parentOf = new Map<string, string | undefined>()
  let boundaryId: string | undefined
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    parentOf.set(n.id, n.parentId)
    if (isBoundary(n)) boundaryId = n.id
  }
  const maxDepth = opts.maxDepth ?? maxNestDepth(nodes)
  const depth =
    opts.depth ??
    nestDepth(parentId, parentOf, boundaryId)
  const isBoundaryParent =
    opts.isBoundary ?? parentId === boundaryId
  const level = levelForParent(depth, maxDepth, isBoundaryParent)
  const weights = { ...levelWeights[level] }
  const algorithm = chooseElkAlgorithm(metrics, weights)
  return {
    parentId,
    level,
    metrics,
    weights,
    algorithm,
    useFixedSidePorts: useFixedSidePorts(weights),
    spacingScale: spacingScale(weights),
    corridorPad: corridorPad(weights),
  }
}

/** Build scope plans for every parent that has children (deepest-first order). */
export function planAllScopes(
  nodes: Node[],
  edges: Edge[],
  levelWeights: LevelWeights,
): ScopePlan[] {
  const parentOf = new Map<string, string | undefined>()
  let boundaryId: string | undefined
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    parentOf.set(n.id, n.parentId)
    if (isBoundary(n)) boundaryId = n.id
  }
  const maxDepth = maxNestDepth(nodes)
  const groups = groupChildrenByParent(nodes)
  const parents = [...groups.keys()].sort((a, b) => {
    const da = nestDepth(a, parentOf, boundaryId)
    const db = nestDepth(b, parentOf, boundaryId)
    if (db !== da) return db - da
    return a.localeCompare(b)
  })
  return parents.map((parentId) =>
    planScope(parentId, nodes, edges, levelWeights, {
      isBoundary: parentId === boundaryId,
      depth: nestDepth(parentId, parentOf, boundaryId),
      maxDepth,
    }),
  )
}
