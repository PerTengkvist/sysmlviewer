import type { SemanticElement } from '../../api'

/** Resolve an interface def id from a typeRef (simple or qualified name). */
export function findInterfaceDefId(
  semantic: Record<string, SemanticElement>,
  typeRef: string | null | undefined,
): string | null {
  if (!typeRef) return null
  const direct = semantic[typeRef]
  if (
    direct?.kind === 'interface' &&
    !(direct.sourceId && direct.targetId)
  ) {
    return direct.id
  }
  const simple = typeRef.split('::').pop() || typeRef
  const match = Object.values(semantic).find(
    (e) =>
      e.kind === 'interface' &&
      e.name === simple &&
      !(e.sourceId && e.targetId),
  )
  return match?.id ?? null
}

/** Ancestor ids from root down to (but not including) artifactId. */
export function ancestorIdsForLocate(
  semantic: Record<string, SemanticElement>,
  artifactId: string,
): string[] {
  const chain: string[] = []
  let cur = semantic[artifactId]
  while (cur?.parentId) {
    chain.unshift(cur.parentId)
    cur = semantic[cur.parentId]
  }
  return chain
}

/** Kind field for interface usage shows the interface class (typeRef). */
export function interfaceUsageKindLabel(el: {
  kind: string
  typeRef?: string | null
  sourceId?: string | null
  targetId?: string | null
}): string | null {
  if (el.kind !== 'interface') return null
  if (!(el.sourceId && el.targetId)) return null
  return el.typeRef || '—'
}
