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
  if (!raw) return null
  // Prefixed library paths (iconmind/…) bypass the carbon allowlist.
  if (raw.includes('/')) return raw
  if (!known.has(raw)) return null
  return raw
}

/**
 * URL for an icon served by the backend.
 * `user` → `/api/icons/user.svg` (default library)
 * `iconmind/agent` → `/api/icons/iconmind/agent.svg`
 */
export function iconUrl(name: string): string {
  const segments = name
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
  return `/api/icons/${segments.join('/')}.svg`
}
