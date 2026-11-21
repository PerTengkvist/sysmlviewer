import type {
  Realization,
  RealizationFinding,
  RealizationPrecision,
  SemanticElement,
} from '../../api'

/**
 * What the Details panel shows about use case realization for one element.
 * Everything is read from the `GET …/realization` payload (derived once, in
 * the backend) and the model; nothing is derived here.
 */

export type RealizationEntry = {
  id: string
  precision: RealizationPrecision
  /** Reached only through `include`. */
  viaInclude: boolean
  /** A function node that only stands for its function, which refines the use case. */
  throughFunction?: boolean
}

export type RealizedByNode = RealizationEntry & { parts: RealizationEntry[] }

/** One function with its function nodes and their logical parts. */
export type RealizedByGroup = {
  /** Null for function nodes that no function of the use case owns or performs for. */
  function: RealizationEntry | null
  nodes: RealizedByNode[]
}

export type StepRealizer = {
  stepId: string
  precision: RealizationPrecision
  nodeIds: string[]
  /** Realizes the whole use case, not this step (a flow or step linked to the use case). */
  viaUseCase: boolean
}

export type RealizesEntry = {
  useCaseId: string
  /** The use case step, when the link ends on one. */
  stepId: string | null
  precision: RealizationPrecision
  viaInclude: boolean
  /** A function node that only stands for its function, which refines the use case. */
  throughFunction?: boolean
}

export type ElementRealization = {
  /** Use case: its realizers, grouped function -> function node -> logical part. */
  realizedBy: RealizedByGroup[]
  /** Use case step an actor performs: the actor. */
  performedBy: string | null
  /** System step: the function steps (or flows) that realize it. */
  stepRealizers: StepRealizer[]
  /** A system step in a use case in scope that nothing realizes. */
  unrealized: boolean
  /** Function step, flow, function, function node: the use cases it realizes. */
  realizes: RealizesEntry[]
  /** Logical part: the use cases it realizes through a function node. */
  realizesViaNode: RealizesEntry[]
  findings: RealizationFinding[]
}

const empty = (): ElementRealization => ({
  realizedBy: [],
  performedBy: null,
  stepRealizers: [],
  unrealized: false,
  realizes: [],
  realizesViaNode: [],
  findings: [],
})

export function hasRealizationInfo(info: ElementRealization): boolean {
  return (
    info.realizedBy.length > 0 ||
    info.performedBy !== null ||
    info.stepRealizers.length > 0 ||
    info.unrealized ||
    info.realizes.length > 0 ||
    info.realizesViaNode.length > 0 ||
    info.findings.length > 0
  )
}

function realizedBy(realization: Realization, ucId: string): RealizedByGroup[] {
  const uc = realization.useCases[ucId]
  if (!uc) return []
  const via = new Set(uc.viaInclude)
  const entry = (id: string, precision: RealizationPrecision): RealizationEntry => ({
    id,
    precision,
    viaInclude: via.has(id),
  })
  const groups = new Map<string | null, RealizedByGroup>()
  const group = (fn: string | null): RealizedByGroup => {
    let g = groups.get(fn)
    if (!g) {
      g = { function: fn ? entry(fn, uc.functions[fn]) : null, nodes: [] }
      groups.set(fn, g)
    }
    return g
  }
  for (const fn of Object.keys(uc.functions)) group(fn)
  for (const [nodeId, precision] of Object.entries(uc.nodes)) {
    const parts = (realization.nodeParts[nodeId] ?? [])
      .filter((p) => p in uc.parts)
      .map((p) => entry(p, uc.parts[p]))
    const node: RealizedByNode = { ...entry(nodeId, precision), parts }
    const functions = (uc.nodeFunctions[nodeId] ?? []).filter((f) => f in uc.functions)
    // A node that refines the use case itself belongs to no function.
    for (const fn of functions.length ? functions : [null]) group(fn).nodes.push(node)
  }
  // A function that refines the use case, with no node of its own serving it, stands for its nodes.
  for (const [nodeId, fn] of Object.entries(uc.functionNodes)) {
    group(fn).nodes.push({
      ...entry(nodeId, 'explicit'),
      viaInclude: via.has(fn),
      throughFunction: true,
      parts: (realization.nodeParts[nodeId] ?? [])
        .filter((p) => uc.functionParts[p] === fn)
        .map((p) => ({ ...entry(p, 'explicit'), viaInclude: via.has(fn), throughFunction: true })),
    })
  }
  return [...groups.values()]
}

function realizesFromMaps(
  realization: Realization,
  key: 'functions' | 'nodes' | 'parts',
  id: string,
): RealizesEntry[] {
  const out: RealizesEntry[] = []
  for (const [ucId, uc] of Object.entries(realization.useCases)) {
    const precision = uc[key][id]
    if (!precision) continue
    out.push({
      useCaseId: ucId,
      stepId: null,
      precision,
      viaInclude: uc.viaInclude.includes(id),
    })
  }
  return out
}

function realizesThroughFunction(
  realization: Realization,
  key: 'functionNodes' | 'functionParts',
  id: string,
): RealizesEntry[] {
  const out: RealizesEntry[] = []
  for (const [ucId, uc] of Object.entries(realization.useCases)) {
    const fn = uc[key][id]
    if (!fn) continue
    out.push({
      useCaseId: ucId,
      stepId: null,
      precision: 'explicit',
      viaInclude: uc.viaInclude.includes(fn),
      throughFunction: true,
    })
  }
  return out
}

function realizesFromLinks(
  realization: Realization,
  semantic: Record<string, SemanticElement>,
  id: string,
): RealizesEntry[] {
  const out: RealizesEntry[] = []
  for (const link of realization.links) {
    // Explicit links (function, function node -> use case) come from the use case maps.
    if (link.sourceId !== id || link.precision === 'explicit') continue
    const target = semantic[link.targetId]
    if (!target) continue
    const isUseCase = target.kind === 'useCase'
    out.push({
      useCaseId: isUseCase ? target.id : (target.parentId ?? target.id),
      stepId: isUseCase ? null : target.id,
      precision: link.precision,
      viaInclude: false,
    })
  }
  return out
}

/** Realization facts about one element; empty for an element outside the realization. */
export function elementRealization(
  realization: Realization | null | undefined,
  semantic: Record<string, SemanticElement>,
  id: string,
): ElementRealization {
  const el = semantic[id]
  if (!realization || !el) return empty()
  const parent = el.parentId ?? ''
  const info: ElementRealization = {
    ...empty(),
    findings: realization.findings.filter((f) => f.elementId === id),
  }
  if (el.kind === 'useCase') info.realizedBy = realizedBy(realization, id)

  info.performedBy = realization.actorSteps[parent]?.[id] ?? null
  if (realization.systemSteps[parent]?.includes(id)) {
    const own = [
      ...(realization.stepRealizers[id] ?? []).map((stepId) => ({
        stepId,
        precision: 'step' as const,
      })),
      ...(realization.coarseRealizers[id] ?? []).map((stepId) => ({
        stepId,
        precision: 'coarse' as const,
      })),
    ]
    // Nothing realizes the step itself: show what covers its whole use case.
    const viaUseCase = own.length === 0
    const found = viaUseCase
      ? (realization.coarseRealizers[parent] ?? []).map((stepId) => ({
          stepId,
          precision: 'coarse' as const,
        }))
      : own
    info.stepRealizers = found.map((r) => ({
      ...r,
      nodeIds: realization.realizerNodes[r.stepId] ?? [],
      viaUseCase,
    }))
    info.unrealized = realization.inScope.includes(parent) && info.stepRealizers.length === 0
    // The gap is shown as "Not realized", not once more as a finding.
    if (info.unrealized) {
      info.findings = info.findings.filter((f) => f.code !== 'unrealized-system-step')
    }
  }

  const seen = new Set<string>()
  const add = (into: RealizesEntry[], entries: RealizesEntry[]) => {
    for (const e of entries) {
      const key = `${e.useCaseId}|${e.stepId ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      into.push(e)
    }
  }
  add(info.realizes, realizesFromLinks(realization, semantic, id))
  add(info.realizes, realizesFromMaps(realization, 'functions', id))
  add(info.realizes, realizesFromMaps(realization, 'nodes', id))
  add(info.realizes, realizesThroughFunction(realization, 'functionNodes', id))
  seen.clear()
  add(info.realizesViaNode, realizesFromMaps(realization, 'parts', id))
  add(info.realizesViaNode, realizesThroughFunction(realization, 'functionParts', id))
  return info
}
