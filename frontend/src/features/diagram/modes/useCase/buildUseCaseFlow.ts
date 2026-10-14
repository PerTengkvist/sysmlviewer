import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { SemanticElement } from '../../../../api'

export type UseCaseFlowParams = {
  title: string
  actors: string[]
  subjects: string[]
  objective: string
}

export type UseCaseFlowGraph = {
  params: UseCaseFlowParams
  nodes: Node[]
  edges: Edge[]
  /** Action artifact ids that should open as separate diagrams (not expanded). */
  actionLinks: string[]
}

const COL_X = 80
const ROW_H = 90

function childrenOf(
  parentId: string,
  semantic: Record<string, SemanticElement>,
): SemanticElement[] {
  return Object.values(semantic).filter((e) => e.parentId === parentId)
}

function isPerform(el: SemanticElement): boolean {
  return (el.metadataKeywords || []).includes('perform')
}

function resolvePerformTarget(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
): SemanticElement | null {
  const ref = el.typeRef || el.name
  const matches = Object.values(semantic).filter(
    (e) => e.id !== el.id && e.name === ref && (e.kind === 'case' || e.kind === 'action'),
  )
  return (
    matches.find((e) => e.kind === 'case') ||
    matches.find((e) => e.kind === 'action') ||
    null
  )
}

/**
 * Build left-side params + top-down flow graph for a use case.
 * CaseScenario performs are expanded inline; plain actions become links.
 */
export function buildUseCaseFlow(
  useCaseId: string,
  semantic: Record<string, SemanticElement>,
): UseCaseFlowGraph {
  const uc = semantic[useCaseId]
  const kids = uc ? childrenOf(useCaseId, semantic) : []
  const actors = kids.filter((e) => e.kind === 'actor').map((e) => e.name)
  const subjects = kids
    .filter(
      (e) =>
        e.kind === 'part' && (e.metadataKeywords || []).includes('subject'),
    )
    .map((e) => e.name)
  const objective =
    uc?.documentation ||
    kids
      .filter(
        (e) =>
          e.kind === 'dependency' &&
          (e.metadataKeywords || []).includes('objective'),
      )
      .map((e) => e.name)
      .join(', ')

  const params: UseCaseFlowParams = {
    title: uc?.name || useCaseId,
    actors,
    subjects,
    objective,
  }

  const actions = kids.filter((e) => e.kind === 'action')
  const successions = kids.filter((e) => e.kind === 'succession')
  const actionLinks: string[] = []

  type FlowStep = { id: string; label: string; kind: string; expandOf?: string }
  const steps: FlowStep[] = []
  const seen = new Set<string>()

  const addActionNode = (el: SemanticElement) => {
    if (seen.has(el.id)) return
    seen.add(el.id)
    if (isPerform(el)) {
      const target = resolvePerformTarget(el, semantic)
      if (target?.kind === 'case') {
        steps.push({
          id: el.id,
          label: el.name,
          kind: 'performCase',
          expandOf: target.id,
        })
        const inner = childrenOf(target.id, semantic).filter(
          (e) => e.kind === 'action',
        )
        for (const a of inner) {
          if (seen.has(`exp:${a.id}`)) continue
          seen.add(`exp:${a.id}`)
          steps.push({
            id: `exp:${a.id}`,
            label: `${target.name}.${a.name}`,
            kind: a.typeRef === 'decide' ? 'decide' : 'action',
          })
        }
        return
      }
      if (target?.kind === 'action') {
        actionLinks.push(target.id)
        steps.push({ id: el.id, label: el.name, kind: 'actionLink' })
        return
      }
    }
    const kind =
      (el.typeRef || '').toLowerCase() === 'start'
        ? 'start'
        : (el.typeRef || '').toLowerCase() === 'done'
          ? 'done'
          : (el.typeRef || '').toLowerCase() === 'decide'
            ? 'decide'
            : 'action'
    steps.push({ id: el.id, label: el.name, kind })
  }

  for (const a of actions) addActionNode(a)

  // Order by succession chain when possible
  const byId = new Map(steps.map((s) => [s.id, s]))
  const ordered: FlowStep[] = []
  const start = steps.find((s) => s.kind === 'start')
  if (start) {
    const walk = (id: string) => {
      const step = byId.get(id)
      if (!step || ordered.includes(step)) return
      ordered.push(step)
      for (const s of successions) {
        if (s.sourceId === id && s.targetId) walk(s.targetId)
      }
    }
    walk(start.id)
  }
  for (const s of steps) {
    if (!ordered.includes(s)) ordered.push(s)
  }

  const nodes: Node[] = ordered.map((step, i) => ({
    id: step.id,
    type: 'action',
    position: { x: COL_X, y: 40 + i * ROW_H },
    data: {
      label: step.label,
      kind: step.kind,
      artifactId: step.id.startsWith('exp:') ? step.id.slice(4) : step.id,
      isStart: step.kind === 'start',
      isDone: step.kind === 'done',
      isDecision: step.kind === 'decide',
      flowDir: 'TD' as const,
      viewMode: 'light' as const,
    },
    style: { width: 160, height: 48 },
  }))

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges: Edge[] = []
  for (const s of successions) {
    if (!s.sourceId || !s.targetId) continue
    if (!nodeIds.has(s.sourceId) || !nodeIds.has(s.targetId)) continue
    edges.push({
      id: s.id,
      source: s.sourceId,
      target: s.targetId,
      label: s.name.startsWith('succ') ? undefined : s.name,
      markerEnd: { type: MarkerType.ArrowClosed },
    })
  }
  // Vertical chain edges when succession missing (expanded case steps)
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]
    const b = ordered[i + 1]
    if (edges.some((e) => e.source === a.id && e.target === b.id)) continue
    if (a.kind === 'performCase' || b.id.startsWith('exp:')) {
      edges.push({
        id: `flow-${a.id}-${b.id}`,
        source: a.id,
        target: b.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    }
  }

  return { params, nodes, edges, actionLinks }
}
