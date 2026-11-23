import type { Edge } from '@xyflow/react'
import type {
  RealizationLaneMode,
  SemanticElement,
  UseCaseFlowRealization,
  ViewPayload,
} from '../../../../api'
import { dependencyLayers } from '../../layout/dependencyLayout'
import { feedbackEdgeIds } from '../../layout/flowLayout'
import { edgeLabel, prettyLabel } from '../actionFlow/buildActionFlowGraph'

/**
 * The activity of a use case, drawn on lanes (a useCaseRealization view). A pure function of the
 * view payload and the lane mode; the realization itself is only read from `view.realization`
 * (derived by the backend), never worked out here.
 *
 * - `blackbox`: the use case flow as written, one lane per actor and a `system` lane.
 * - `whitebox`: a system step that function steps realize is replaced by the chain of them
 *   (sorted by rank in their function flow), one lane per function node, grouped by function.
 * - `logical`: as `whitebox`, but the lane of a node is its first `allocate` target.
 */

export type FlowNodeKind = 'step' | 'start' | 'done' | 'decision' | 'call'

export type RealizationFlowNode = {
  /** Node id: the step id, or `<ucStep>/<fStep>` for a function step drawn more than once. */
  id: string
  /** The model element the node stands for (what a click selects). */
  artifactId: string
  kind: FlowNodeKind
  label: string
  lane: string
  /** `+n`: the step also belongs to n more lanes (more performers or allocate targets). */
  badge?: string
  /** A system step that nothing realizes, in a use case that has step links. */
  unrealized?: boolean
  /** A system step that a flow realizes as a whole. */
  coarse?: boolean
  /** A call node: the use case it calls, and the view that opens it, if any. */
  calledUseCaseId?: string
  calledViewId?: string | null
}

export type RealizationFlowEdge = {
  id: string
  source: string
  target: string
  label?: string
}

export type LaneKind = 'actor' | 'node' | 'part' | 'function' | 'system' | 'unallocated'

export type RealizationLane = {
  id: string
  label: string
  kind: LaneKind
  /** Function whose frame the lane sits under (white box only). */
  group?: string
  groupLabel?: string
  /**
   * No step stands here: the use case reaches the lane by a `#refine` from the node itself
   * (`explicit`) or only through the function that refines it (`function`).
   */
  reach?: 'explicit' | 'function'
}

export type ExpandedFlow = {
  nodes: RealizationFlowNode[]
  edges: RealizationFlowEdge[]
  /** In default order: actors, lanes by their first step, `unallocated`, `system`. */
  lanes: RealizationLane[]
}

export const SYSTEM_LANE = 'system'
export const UNALLOCATED_LANE = 'unallocated'

const DECISION_TYPES = new Set(['decision', 'condition', 'decide'])
const PSEUDO: ReadonlySet<FlowNodeKind> = new Set(['start', 'done', 'decision'])

const unique = <T,>(items: T[]): T[] => [...new Set(items)]

type Item = {
  id: string
  /** The element a click selects; the use case itself for a start/done made up here. */
  elementId: string
  kind: FlowNodeKind
  name: string
  calledUseCaseId?: string
  calledViewId?: string | null
}

type Succession = { id: string; source: string; target: string; label: string }

/** The nodes and successions of the use case as written. */
function useCaseFlow(
  uc: string,
  semantic: Record<string, SemanticElement>,
  real: UseCaseFlowRealization,
): { items: Item[]; successions: Succession[] } {
  const calls = new Map(real.calls.map((c) => [c.id, c]))
  const steps = new Set([...real.systemSteps, ...Object.keys(real.actorSteps)])
  const items: Item[] = []
  const written: SemanticElement[] = []
  for (const el of Object.values(semantic)) {
    if (el.parentId !== uc) continue
    const item = { id: el.id, elementId: el.id, name: el.name }
    const call = calls.get(el.id)
    if (el.kind === 'succession') written.push(el)
    else if (call) {
      items.push({ ...item, kind: 'call', calledUseCaseId: call.calledUseCaseId, calledViewId: call.viewId })
    }
    else if (el.kind !== 'action') continue
    else if (el.typeRef === 'start') items.push({ ...item, kind: 'start' })
    else if (el.typeRef === 'done') items.push({ ...item, kind: 'done' })
    else if (DECISION_TYPES.has((el.typeRef || '').toLowerCase())) items.push({ ...item, kind: 'decision' })
    else if (steps.has(el.id)) items.push({ ...item, kind: 'step' })
  }
  const known = new Set(items.map((i) => i.id))
  const successions: Succession[] = written
    .filter((s) => s.sourceId && s.targetId && known.has(s.sourceId) && known.has(s.targetId))
    .map((s) => ({ id: s.id, source: s.sourceId!, target: s.targetId!, label: edgeLabel(s) }))

  // A use case written without successions runs its steps in declaration order.
  const body = items.filter((i) => !PSEUDO.has(i.kind))
  if (!successions.length && body.length) {
    const made = (kind: 'start' | 'done'): Item =>
      items.find((i) => i.kind === kind) ?? { id: `${uc}/${kind}`, elementId: uc, kind, name: kind }
    const start = made('start')
    const done = made('done')
    for (const item of [start, done]) if (!items.includes(item)) items.push(item)
    const run = [start, ...body, done]
    run.slice(1).forEach((item, i) =>
      successions.push({ id: `${uc}/seq${i}`, source: run[i].id, target: item.id, label: '' }),
    )
  }
  return { items, successions }
}

/** Layer of each step of a function flow: its rank in the order the flow runs them. */
function flowRanks(flow: string, semantic: Record<string, SemanticElement>): Map<string, number> {
  const kids = Object.values(semantic).filter((e) => e.parentId === flow)
  const ids = kids.filter((e) => e.kind === 'action').map((e) => e.id)
  const edges: Edge[] = kids
    .filter((e) => e.kind === 'succession' && e.sourceId && e.targetId)
    .map((e) => ({ id: e.id, source: e.sourceId!, target: e.targetId! }))
  const feedback = feedbackEdgeIds(edges, kids.find((e) => e.typeRef === 'start')?.id)
  const forward = edges.filter((e) => !feedback.has(e.id))
  const ranks = new Map<string, number>()
  dependencyLayers(ids, forward).forEach((layer, i) => layer.forEach((id) => ranks.set(id, i)))
  return ranks
}

/**
 * A function step is written like a step of the use case (`prettyLabel`: camel case split), also
 * when the backend qualified its name to tell two apart (`Security::checkKey`): the qualifier
 * stays, the last segment is split.
 */
function stepName(label: string): string {
  const cut = label.lastIndexOf('::')
  return cut < 0 ? prettyLabel(label, false) : `${label.slice(0, cut + 2)}${prettyLabel(label.slice(cut + 2), false)}`
}

export function expandRealizationFlow(
  view: Pick<ViewPayload, 'semantic' | 'flowRealization' | 'laneTargets' | 'realizationLabels'>,
  mode: RealizationLaneMode,
): ExpandedFlow {
  const real = view.flowRealization
  if (!real) return { nodes: [], edges: [], lanes: [] }
  const semantic = view.semantic
  const targets = view.laneTargets ?? {}
  const labels = view.realizationLabels ?? {}
  const nameOf = (id: string) => labels[id] ?? semantic[id]?.name ?? id.split('::').pop() ?? id
  const expand = mode !== 'blackbox'
  const { items, successions } = useCaseFlow(real.useCaseId, semantic, real)

  const laneKinds = new Map<string, LaneKind>()
  const lane = (id: string, kind: LaneKind): string => {
    if (!laneKinds.has(id)) laneKinds.set(id, kind)
    return id
  }
  /** The lanes a realizer's performers stand in: one per node, or per allocate target. */
  const lanesOf = (realizer: string): string[] => {
    const performers = real.realizerNodes[realizer] ?? []
    if (!performers.length) {
      const fn = real.realizerFunctions[realizer]
      if (mode === 'logical') return [lane(UNALLOCATED_LANE, 'unallocated')]
      return [fn ? lane(fn, 'function') : lane(SYSTEM_LANE, 'system')]
    }
    return unique(
      performers.flatMap((n) =>
        mode === 'logical'
          ? (targets[n]?.length ? targets[n] : [UNALLOCATED_LANE]).map((p) =>
              lane(p, p === UNALLOCATED_LANE ? 'unallocated' : 'part'),
            )
          : [lane(n, 'node')],
      ),
    )
  }
  const inLanes = (lanes: string[]): Pick<RealizationFlowNode, 'lane' | 'badge'> => ({
    lane: lanes[0],
    ...(lanes.length > 1 ? { badge: `+${lanes.length - 1}` } : {}),
  })

  // A function step that realizes several system steps is drawn once for each.
  const uses = new Map<string, number>()
  for (const fs of Object.values(real.stepRealizers)) for (const f of fs) uses.set(f, (uses.get(f) ?? 0) + 1)
  const flowRank = new Map<string, Map<string, number>>()
  const rankOf = (step: string): number => {
    const flow = semantic[step]?.parentId ?? ''
    if (!flowRank.has(flow)) flowRank.set(flow, flowRanks(flow, semantic))
    return flowRank.get(flow)!.get(step) ?? 0
  }

  const nodes: RealizationFlowNode[] = []
  const entry = new Map<string, string>() // system step -> first node of its chain
  const exit = new Map<string, string>() // system step -> last node of its chain
  const chainEdges: RealizationFlowEdge[] = []
  const unrealized = new Set(real.unrealizedSteps)

  /** Draws the realizers of a UC step in rank order, linked in a chain; returns the node ids. */
  const chainOf = (stepId: string, realizers: string[]): string[] => {
    const flows = unique(realizers.map((f) => semantic[f]?.parentId ?? ''))
    const chain = realizers
      .map((f, i) => ({ f, i }))
      .sort(
        (a, b) =>
          flows.indexOf(semantic[a.f]?.parentId ?? '') - flows.indexOf(semantic[b.f]?.parentId ?? '') ||
          rankOf(a.f) - rankOf(b.f) ||
          a.i - b.i,
      )
      .map((c) => c.f)
    const ids = chain.map((f) => ((uses.get(f) ?? 0) > 1 ? `${stepId}/${f}` : f))
    chain.forEach((f, i) => {
      nodes.push({ id: ids[i], artifactId: f, kind: 'step', label: stepName(nameOf(f)), ...inLanes(lanesOf(f)) })
      if (i > 0) chainEdges.push({ id: `${stepId}/chain/${i}`, source: ids[i - 1], target: ids[i] })
    })
    return ids
  }

  for (const item of items) {
    const base = { id: item.id, artifactId: item.elementId }
    if (PSEUDO.has(item.kind)) {
      // Placed after the others, in the lane of a neighbour.
      nodes.push({ ...base, kind: item.kind, label: item.kind === 'decision' ? prettyLabel(item.name, true) : '', lane: '' })
      continue
    }
    if (item.kind === 'call') {
      const called = item.calledUseCaseId!
      nodes.push({
        ...base,
        kind: 'call',
        label: `▸ ${semantic[called]?.name ?? called}`,
        lane: lane(SYSTEM_LANE, 'system'),
        calledUseCaseId: called,
        calledViewId: item.calledViewId ?? null,
      })
      continue
    }
    const label = prettyLabel(item.name, false)
    const actor = real.actorSteps[item.id]
    const realizers = expand ? (real.stepRealizers[item.id] ?? []) : []
    if (actor) {
      nodes.push({ ...base, kind: 'step', label, lane: lane(actor, 'actor') })
      // Realizers of an actor step follow it; they do not replace it.
      const ids = chainOf(item.id, realizers)
      if (ids.length) {
        chainEdges.push({ id: `${item.id}/chain/0`, source: item.id, target: ids[0] })
        exit.set(item.id, ids[ids.length - 1])
      }
      continue
    }
    const coarse = expand && !realizers.length ? (real.coarseSteps[item.id] ?? []) : []
    if (realizers.length) {
      const ids = chainOf(item.id, realizers)
      entry.set(item.id, ids[0])
      exit.set(item.id, ids[ids.length - 1])
    } else if (coarse.length) {
      nodes.push({ ...base, kind: 'step', label, coarse: true, ...inLanes(lanesOf(coarse[0])) })
    } else {
      nodes.push({
        ...base,
        kind: 'step',
        label,
        lane: lane(SYSTEM_LANE, 'system'),
        ...(unrealized.has(item.id) ? { unrealized: true } : {}),
      })
    }
  }
  lane(SYSTEM_LANE, 'system')

  // A chain takes the place of its step: what led into the step leads into the chain.
  const edges: RealizationFlowEdge[] = [
    ...successions.map((s) => ({
      id: s.id,
      source: exit.get(s.source) ?? s.source,
      target: entry.get(s.target) ?? s.target,
      ...(s.label ? { label: s.label } : {}),
    })),
    ...chainEdges,
  ]

  // Start takes the lane of what follows it; done and decisions that of what leads in.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const fallback = real.actors[0] ? lane(real.actors[0], 'actor') : SYSTEM_LANE
  const neighbourLane = (id: string, side: 'source' | 'target', seen = new Set<string>()): string | null => {
    if (seen.has(id)) return null
    seen.add(id)
    const other = side === 'source' ? 'target' : 'source'
    for (const e of edges.filter((e) => e[side] === id)) {
      const node = byId.get(e[other])
      if (!node) continue
      if (!PSEUDO.has(node.kind)) return node.lane
      const found = neighbourLane(node.id, side, seen)
      if (found) return found
    }
    return null
  }
  for (const n of nodes) {
    if (n.kind === 'start') n.lane = neighbourLane(n.id, 'source') ?? fallback
  }
  for (const n of nodes) {
    if (n.kind === 'done' || n.kind === 'decision') {
      n.lane = neighbourLane(n.id, 'target') ?? neighbourLane(n.id, 'source') ?? fallback
    }
  }

  // Lane order: actors, then the others by the first step that uses them, `unallocated`, `system`.
  const layerOf = new Map<string, number>()
  dependencyLayers(nodes.map((n) => n.id), edges).forEach((layer, i) => layer.forEach((id) => layerOf.set(id, i)))
  const position = new Map(nodes.map((n, i) => [n.id, i]))
  const appearance = unique(
    nodes
      .filter((n) => !PSEUDO.has(n.kind))
      .sort((a, b) => layerOf.get(a.id)! - layerOf.get(b.id)! || position.get(a.id)! - position.get(b.id)!)
      .map((n) => n.lane),
  )
  const actors = real.actors.map((a) => lane(a, 'actor'))
  const groupOf = (id: string): string | undefined =>
    mode === 'whitebox' && laneKinds.get(id) === 'node'
      ? (real.nodeFunctions[id]?.[0] ?? real.functionNodes[id])
      : undefined
  const middle = appearance.filter((l) => !actors.includes(l) && l !== SYSTEM_LANE && l !== UNALLOCATED_LANE)
  // What the use case reaches without a step has lanes without steps: by a `#refine` from the
  // node itself (and the parts it allocates to), or only through the function that refines it.
  const reach = new Map<string, 'explicit' | 'function'>()
  if (mode !== 'blackbox') {
    const ids = (kind: 'explicit' | 'function') => {
      const nodes = Object.keys(kind === 'explicit' ? real.explicitNodes : real.functionNodes)
      const parts = Object.keys(kind === 'explicit' ? real.explicitParts : real.functionParts)
      return mode === 'whitebox'
        ? nodes.map((n) => [n, 'node'] as const)
        : [...nodes.flatMap((n) => targets[n] ?? []), ...parts].map((p) => [p, 'part'] as const)
    }
    for (const kind of ['explicit', 'function'] as const) {
      for (const [id, laneKind] of ids(kind)) {
        if (middle.includes(id) || actors.includes(id)) continue
        lane(id, laneKind)
        middle.push(id)
        reach.set(id, kind)
      }
    }
  }
  // The lanes of one function sit side by side, at the place of the group's first lane.
  const ordered: string[] = []
  for (const l of middle) {
    if (ordered.includes(l)) continue
    ordered.push(l)
    const group = groupOf(l)
    if (group) ordered.push(...middle.filter((o) => groupOf(o) === group && !ordered.includes(o)))
  }
  const order = [
    ...actors,
    ...ordered,
    ...(appearance.includes(UNALLOCATED_LANE) ? [UNALLOCATED_LANE] : []),
    SYSTEM_LANE,
  ]
  const subject = real.subject ? semantic[real.subject]?.name : undefined
  const lanes: RealizationLane[] = order.map((id) => {
    const kind = laneKinds.get(id) ?? 'node'
    const group = groupOf(id)
    const label = kind === 'system' ? (subject ?? 'System') : kind === 'unallocated' ? 'Unallocated' : nameOf(id)
    return {
      id,
      kind,
      label,
      ...(group ? { group, groupLabel: nameOf(group) } : {}),
      ...(reach.has(id) ? { reach: reach.get(id) } : {}),
    }
  })
  return { nodes, edges, lanes }
}
