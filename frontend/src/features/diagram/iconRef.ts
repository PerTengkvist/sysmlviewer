import type { SemanticElement } from '../../api'

const KNOWN = new Set([
  'satellite',
  'satellite-radar',
  'user',
  'user-filled',
])

/** Read `_icon` attribute default from children of `el`. */
export function iconNameForElement(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  known: Set<string> = KNOWN,
): string | null {
  const children = Object.values(semantic).filter((c) => c.parentId === el.id)
  const attr = children.find(
    (c) => c.kind === 'attribute' && c.name === '_icon',
  )
  if (!attr?.defaultValue) return null
  const raw = attr.defaultValue.replace(/^["']|["']$/g, '').trim()
  if (!raw || !known.has(raw)) return null
  return raw
}

export function iconUrl(name: string): string {
  return `/api/icons/${encodeURIComponent(name)}.svg`
}
