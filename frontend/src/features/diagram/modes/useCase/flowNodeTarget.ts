import type { SemanticElement } from '../../../../api'

/**
 * The element a click on a node of the use case flow opens: a step of the use
 * case itself, or for a `perform` link node the action it performs. Start, done,
 * decision and expanded case nodes open nothing.
 */
export function flowNodeTarget(
  data: { kind?: unknown; artifactId?: unknown },
  semantic: Record<string, SemanticElement>,
  useCaseId: string,
): string | null {
  const id = typeof data.artifactId === 'string' ? data.artifactId : null
  const el = id ? semantic[id] : undefined
  if (!el || el.parentId !== useCaseId) return null
  if (data.kind === 'action') return el.id
  if (data.kind === 'actionLink') {
    const target = el.performTargetId
    return target && semantic[target] ? target : null
  }
  return null
}
