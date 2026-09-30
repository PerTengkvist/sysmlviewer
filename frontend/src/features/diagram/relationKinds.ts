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
