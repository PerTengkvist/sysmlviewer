import type { SemanticElement } from '../../api'

/**
 * Resolve a port def id from a typeRef (simple or qualified name).
 * Prefers package-level ports with no typeRef (true `port def`), ignoring
 * nested ports under other ports.
 */
export function findPortDefId(
  semantic: Record<string, SemanticElement>,
  typeRef: string | null | undefined,
): string | null {
  if (!typeRef) return null
  const direct = semantic[typeRef]
  if (direct?.kind === 'port' && direct.typeRef == null) {
    const parent = direct.parentId ? semantic[direct.parentId] : null
    if (!parent || parent.kind === 'package') return direct.id
  }
  const simple = typeRef.split('::').pop() || typeRef
  const candidates = Object.values(semantic).filter(
    (e) => e.kind === 'port' && e.name === simple && e.typeRef == null,
  )
  for (const e of candidates) {
    const parent = e.parentId ? semantic[e.parentId] : null
    if (parent?.kind === 'package') return e.id
  }
  for (const e of candidates) {
    const parent = e.parentId ? semantic[e.parentId] : null
    if (parent?.kind === 'port') continue
    return e.id
  }
  return null
}

/** Label for a typed port usage (typeRef), or null when not a usage. */
export function portUsageTypeLabel(el: {
  kind: string
  typeRef?: string | null
}): string | null {
  if (el.kind !== 'port') return null
  return el.typeRef || null
}
