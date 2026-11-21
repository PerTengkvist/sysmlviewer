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
}

export type RealizesEntry = {
  useCaseId: string
  /** The use case step, when the link ends on one. */
  stepId: string | null
  precision: RealizationPrecision
  viaInclude: boolean
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

function isPerform(el: SemanticElement): boolean {
  return el.kind === 'action' && (el.metadataKeywords ?? []).includes('perform')
}

/** Parts (not actors) that perform `actionId`, in model order. */
function performersOf(
  semantic: Record<string, SemanticElement>,
  actionId: string,
): string[] {
  const out: string[] = []
  for (const el of Object.values(semantic)) {
    if (!isPerform(el) || el.performTargetId !== actionId || !el.parentId) continue
    const owner = semantic[el.parentId]
    if (owner?.kind === 'part' && !out.includes(owner.id)) out.push(owner.id)
  }
  return out
}

function isAncestor(
  semantic: Record<string, SemanticElement>,
  ancestorId: string,
  id: string,
): boolean {
  const seen = new Set<string>()
  let cur = semantic[id]?.parentId ?? null
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true
    seen.add(cur)
    cur = semantic[cur]?.parentId ?? null
  }
  return false
}

/** The function (among `functions`) a function node performs steps of, or sits in. */
function functionOfNode(
  semantic: Record<string, SemanticElement>,
  functions: string[],
  nodeId: string,
): string | null {
  for (const el of Object.values(semantic)) {
    if (!isPerform(el) || el.parentId !== nodeId || !el.performTargetId) continue
    const flow = semantic[el.performTargetId]?.parentId
    const fn = flow ? semantic[flow]?.parentId : null
    if (fn && functions.includes(fn)) return fn
  }
  return functions.find((f) => isAncestor(semantic, f, nodeId)) ?? null
}

function partsOfNode(
  semantic: Record<string, SemanticElement>,
  nodeId: string,
): string[] {
  return Object.values(semantic)
    .filter((e) => e.kind === 'allocation' && e.sourceId === nodeId && e.targetId)
    .map((e) => e.targetId as string)
}

function realizedBy(
  realization: Realization,
  semantic: Record<string, SemanticElement>,
  ucId: string,
): RealizedByGroup[] {
  const uc = realization.useCases[ucId]
  if (!uc) return []
  const via = new Set(uc.viaInclude)
  const entry = (id: string, precision: RealizationPrecision): RealizationEntry => ({
    id,
    precision,
    viaInclude: via.has(id),
  })
  const functions = Object.keys(uc.functions)
  const groups = new Map<string | null, RealizedByGroup>()
  const group = (fn: string | null): RealizedByGroup => {
    let g = groups.get(fn)
    if (!g) {
      g = { function: fn ? entry(fn, uc.functions[fn]) : null, nodes: [] }
      groups.set(fn, g)
    }
    return g
  }
  for (const fn of functions) group(fn)
  const placedParts = new Set<string>()
  for (const [nodeId, precision] of Object.entries(uc.nodes)) {
    const parts = partsOfNode(semantic, nodeId)
      .filter((p) => p in uc.parts)
      .map((p) => {
        placedParts.add(p)
        return entry(p, uc.parts[p])
      })
    group(functionOfNode(semantic, functions, nodeId)).nodes.push({
      ...entry(nodeId, precision),
      parts,
    })
  }
  const result = [...groups.values()]
  const loose = Object.keys(uc.parts).filter((p) => !placedParts.has(p))
  if (loose.length) {
    // Parts whose function node is not in the use case's node map: list them on their own.
    group(null).nodes.push(
      ...loose.map((p) => ({ ...entry(p, uc.parts[p]), parts: [] })),
    )
    if (!result.includes(groups.get(null)!)) result.push(groups.get(null)!)
  }
  return result
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
  if (el.kind === 'useCase') info.realizedBy = realizedBy(realization, semantic, id)

  info.performedBy = realization.actorSteps[parent]?.[id] ?? null
  if (realization.systemSteps[parent]?.includes(id)) {
    const steps = (realization.stepRealizers[id] ?? []).map((stepId) => ({
      stepId,
      precision: 'step' as const,
      nodeIds: performersOf(semantic, stepId),
    }))
    const coarse = (realization.coarseRealizers[id] ?? []).map((stepId) => ({
      stepId,
      precision: 'coarse' as const,
      nodeIds: performersOf(semantic, stepId),
    }))
    info.stepRealizers = [...steps, ...coarse]
    info.unrealized =
      realization.inScope.includes(parent) &&
      info.stepRealizers.length === 0 &&
      !realization.coarseRealizers[parent]?.length
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
  seen.clear()
  add(info.realizesViaNode, realizesFromMaps(realization, 'parts', id))
  return info
}
