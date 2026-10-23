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

export type IconMindStyle =
  | 'outline-regular'
  | 'outline-thin'
  | 'duotone-regular'

export type ToolbarIconRef = {
  library: 'iconmind'
  slug: string
  style: IconMindStyle
  /** IconMind category folder on the CDN. */
  category: string
}

const ICONMIND_CDN =
  'https://cdn.jsdelivr.net/npm/@iconmind/icons@0.8.1'

/**
 * URL for an icon served by the backend.
 * `user` → `/api/icons/user.svg` (default library)
 * `iconmind/agent` → `/api/icons/iconmind/agent.svg`
 * Optional `style` → `?style=outline-thin`
 */
export function iconUrl(
  name: string,
  opts?: { style?: string },
): string {
  const segments = name
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
  const base = `/api/icons/${segments.join('/')}.svg`
  if (opts?.style) {
    return `${base}?style=${encodeURIComponent(opts.style)}`
  }
  return base
}

/** Direct CDN URL for a toolbar IconMind icon (works without backend vendoring). */
export function iconmindCdnUrl(icon: ToolbarIconRef): string {
  return `${ICONMIND_CDN}/icons/${encodeURIComponent(icon.category)}/${encodeURIComponent(icon.slug)}/${encodeURIComponent(icon.style)}.svg`
}

/** Canvas toolbar IconMind refs (slug + variant + category). */
export const TOOLBAR_ICONS = {
  copy: {
    library: 'iconmind',
    slug: 'copy',
    style: 'outline-regular',
    category: 'interface',
  },
  alignH: {
    library: 'iconmind',
    slug: 'align-center-horizontal',
    style: 'outline-regular',
    category: 'interface',
  },
  alignV: {
    library: 'iconmind',
    slug: 'align-center-vertical',
    style: 'outline-regular',
    category: 'interface',
  },
  lockAll: {
    library: 'iconmind',
    slug: 'lock',
    style: 'outline-thin',
    category: 'security',
  },
  unlockAll: {
    library: 'iconmind',
    slug: 'unlock',
    style: 'outline-thin',
    category: 'security',
  },
  layoutRules: {
    library: 'iconmind',
    slug: 'layout-dashboard',
    style: 'outline-thin',
    category: 'interface',
  },
  autoLayout: {
    library: 'iconmind',
    slug: 'runbook-auto',
    style: 'outline-thin',
    category: 'devops',
  },
  flipH: {
    library: 'iconmind',
    slug: 'flip-h',
    style: 'duotone-regular',
    category: 'interface',
  },
  flipV: {
    library: 'iconmind',
    slug: 'flip-v',
    style: 'duotone-regular',
    category: 'interface',
  },
  distributeH: {
    library: 'iconmind',
    slug: 'align-horizontal-space-between',
    style: 'outline-regular',
    category: 'interface',
  },
  distributeV: {
    library: 'iconmind',
    slug: 'align-vertical-space-between',
    style: 'outline-regular',
    category: 'interface',
  },
  undo: {
    library: 'iconmind',
    slug: 'undo',
    style: 'outline-thin',
    category: 'interface',
  },
  redo: {
    library: 'iconmind',
    slug: 'redo',
    style: 'outline-thin',
    category: 'interface',
  },
  updateJumpers: {
    library: 'iconmind',
    slug: 'multi-hop',
    style: 'outline-thin',
    category: 'rag',
  },
} as const satisfies Record<string, ToolbarIconRef>
