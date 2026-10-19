/** Edges and relationships. Hidden in tree diagrams and the model tree. */
export const RELATION_KINDS = new Set([
  'connection',
  'dependency',
  'allocation',
  'binding',
  'flow',
  'specialization',
  'subsetting',
  'redefinition',
  'include',
  'satisfy',
])

export function isRelationKind(kind: string): boolean {
  return RELATION_KINDS.has(kind)
}

/** Interface usages (both ends) are relations; interface defs are not. */
export function isRelationElement(el: {
  kind: string
  sourceId?: string | null
  targetId?: string | null
}): boolean {
  if (el.kind === 'interface') {
    return Boolean(el.sourceId && el.targetId)
  }
  return isRelationKind(el.kind)
}
