import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { SemanticElement } from '../../../../api'
import { orientEdgeHandles } from '../../layout/dependencyLayout'
import {
  elementDisplayName,
  useCaseRequirementLinks,
} from '../../../details/elementRelations'

export type UseCaseRequirement = {
  id: string
  /** objective, refine, derive, satisfy or requirement (declared inside). */
  label: string
  /** `REQ-PERF-06 PowerModes` */
  name: string
}

export type UseCaseFlowParams = {
  title: string
  actors: string[]
  subjects: string[]
  objective: string
  /** Requirements this use case traces to, from the whole model. */
  requirements: UseCaseRequirement[]
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
  const requirements: UseCaseRequirement[] = uc
    ? useCaseRequirementLinks(semantic, useCaseId).map((link) => ({
        id: link.requirementId,
        label: link.label,
        name: elementDisplayName(semantic[link.requirementId], link.requirementId),
      }))
    : []
  // The requirements named by `objective X;`, else the use case text (the
  // parser folds `objective { doc }` into the use case documentation).
  const objective =
    requirements
      .filter((r) => r.label === 'objective')
      .map((r) => r.name)
      .join(', ') ||
    uc?.documentation ||
    ''

  const params: UseCaseFlowParams = {
    title: uc?.name || useCaseId,
    actors,
    subjects,
    objective,
    requirements,
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

  return { params, nodes, edges: orientFlowPorts(nodes, edges, start?.id), actionLinks }
}

/**
 * Edge ids that loop back: depth-first from start, an edge whose target is
 * still on the walk's stack. Converging branches are not loops, so the
 * order of the column (a preorder walk) is not used for this.
 */
export function feedbackEdgeIds(edges: Edge[], startId: string | undefined): Set<string> {
  const out = new Map<string, Edge[]>()
  for (const e of edges) {
    const list = out.get(e.source)
    if (list) list.push(e)
    else out.set(e.source, [e])
  }
  const feedback = new Set<string>()
  const done = new Set<string>()
  const onStack = new Set<string>()
  const visit = (id: string) => {
    onStack.add(id)
    for (const e of out.get(id) || []) {
      if (onStack.has(e.target)) feedback.add(e.id)
      else if (!done.has(e.target)) visit(e.target)
    }
    onStack.delete(id)
    done.add(id)
  }
  if (startId) visit(startId)
  return feedback
}

function isDecision(n: Node | undefined): boolean {
  return !!(n?.data as { isDecision?: boolean } | undefined)?.isDecision
}

/**
 * Top-down ports: in at the top, out at the bottom; decision branches as in
 * the action flow (yes left, else right). A loop back leaves on the right and
 * enters the earlier step on its right side, drawn as a step line beside the
 * column; the other branch of a looping decision then goes down.
 */
function orientFlowPorts(nodes: Node[], edges: Edge[], startId: string | undefined): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const feedback = feedbackEdgeIds(edges, startId)
  // `then if g then a else b` names its branches if_g_yes / if_g_else.
  const hinted = edges.map((e) => {
    if (!isDecision(byId.get(e.source))) return e
    const name = String(e.label ?? e.id)
    if (/_yes$/i.test(name)) return { ...e, sourceHandle: 'yes', label: 'yes' }
    if (/_else$/i.test(name)) return { ...e, sourceHandle: 'no', label: 'else' }
    if (/_no$/i.test(name)) return { ...e, sourceHandle: 'no', label: 'no' }
    return e
  })
  const oriented = orientEdgeHandles(hinted, 'TD', nodes)
  const loopingDecisions = new Set(
    oriented.filter((e) => feedback.has(e.id) && isDecision(byId.get(e.source))).map((e) => e.source),
  )
  return oriented.map((e) => {
    if (feedback.has(e.id)) {
      return {
        ...e,
        sourceHandle: isDecision(byId.get(e.source)) ? 'out-right' : 'out',
        targetHandle: 'in-right',
        type: 'smoothstep',
        data: { ...(e.data as Record<string, unknown>), feedback: true },
      }
    }
    if (loopingDecisions.has(e.source) && e.sourceHandle === 'out-right') {
      return { ...e, sourceHandle: 'out-bottom' }
    }
    return e
  })
}
