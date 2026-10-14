import { camelCaseSegments } from '../diagram/modes/sequence/camelWrap'

/** Split a tree label for wrap-at-capital display. Names with spaces stay whole. */
export function viewTreeNameParts(name: string): string[] {
  if (!name) return []
  if (/\s/.test(name)) return [name]
  const parts = camelCaseSegments(name)
  return parts.length > 0 ? parts : [name]
}
