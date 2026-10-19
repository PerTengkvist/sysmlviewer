/**
 * Part `_icon` / `_icon_body` → Lucide (any icon) or SVG libraries (`iconmind/…`).
 *
 * Bare name → Lucide (kebab-case or PascalCase).
 * `iconmind/<name>` / `carbon/<name>` → SVG via `/api/icons/…`.
 */

export const PART_ICON_ATTR = '_icon'
export const PART_ICON_BODY_ATTR = '_icon_body'

/** Attribute names that drive icons and must not appear in the attribute list. */
export const PART_ICON_ATTR_NAMES = new Set([
  PART_ICON_ATTR,
  PART_ICON_BODY_ATTR,
])

import type { LucideIcon } from 'lucide-react'
import { icons as lucideIcons } from 'lucide-react'
import type { SemanticElement } from '../../api'
import { iconUrl } from './iconRef'

export function stripIconQuotes(value: string): string {
  const v = value.trim()
  if (
    v.length >= 2 &&
    ((v[0] === '"' && v[v.length - 1] === '"') ||
      (v[0] === "'" && v[v.length - 1] === "'"))
  ) {
    return v.slice(1, -1).trim()
  }
  return v
}

/** kebab-case / snake_case / spaced → PascalCase (circuit-board → CircuitBoard). */
export function toPascalCaseIcon(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export type ParsedPartIcon =
  | { kind: 'lucide'; name: string }
  | { kind: 'svg'; library: string; name: string; path: string }

/**
 * Parse `_icon` value. Unprefixed → Lucide. `library/name` → SVG library.
 */
export function parsePartIconRef(
  raw: string | null | undefined,
): ParsedPartIcon | null {
  if (!raw) return null
  const value = stripIconQuotes(raw)
  if (!value) return null
  const slash = value.indexOf('/')
  if (slash > 0) {
    const library = value.slice(0, slash).trim().toLowerCase()
    const name = value.slice(slash + 1).trim()
    if (!library || !name || name.includes('..') || name.includes('\\')) {
      return null
    }
    // lucide/cloud is an explicit Lucide reference
    if (library === 'lucide') {
      return { kind: 'lucide', name }
    }
    return { kind: 'svg', library, name, path: `${library}/${name}` }
  }
  return { kind: 'lucide', name: value }
}

/** Resolve any Lucide icon by kebab-case or PascalCase name. */
export function resolveLucideIcon(
  name: string | null | undefined,
): LucideIcon | null {
  if (!name) return null
  const cleaned = stripIconQuotes(name)
  if (!cleaned) return null
  const pascal = toPascalCaseIcon(cleaned)
  const fromPascal = (lucideIcons as Record<string, LucideIcon | undefined>)[
    pascal
  ]
  if (fromPascal) return fromPascal
  // Already PascalCase (Cloud) or odd casing
  const direct = (lucideIcons as Record<string, LucideIcon | undefined>)[
    cleaned
  ]
  return direct || null
}

/** @deprecated Prefer parsePartIconRef + resolveLucideIcon; kept for call sites. */
export function resolvePartIcon(
  name: string | null | undefined,
): LucideIcon | null {
  const ref = parsePartIconRef(name)
  if (!ref || ref.kind !== 'lucide') return null
  return resolveLucideIcon(ref.name)
}

/** URL for SVG library icons (`iconmind/agent` → `/api/icons/iconmind/agent.svg`). */
export function partSvgIconUrl(path: string): string {
  return iconUrl(path)
}

type IconAttrChild = {
  name: string
  kind?: string
  defaultValue?: string | null
}

function iconFromChildren(
  children: string[],
  semantic: Record<string, IconAttrChild | undefined>,
  attrName: string,
): string | null {
  for (const cid of children) {
    const child = semantic[cid]
    if (child?.kind === 'attribute' && child.name === attrName) {
      const raw = child.defaultValue?.trim()
      if (!raw) return null
      const name = stripIconQuotes(raw)
      return name || null
    }
  }
  return null
}

/**
 * Read an icon attribute from a part usage, falling back to its type definition
 * (same walk as attribute inheritance in buildStructureGraph).
 */
export function readPartIconAttr(
  semantic: Record<string, SemanticElement | undefined>,
  partId: string,
  attrName: string,
): string | null {
  const part = semantic[partId]
  if (!part) return null
  const direct = iconFromChildren(part.children || [], semantic, attrName)
  if (direct) return direct
  if (!part.typeRef) return null
  const typeDef = Object.values(semantic).find(
    (e) => e && e.kind === 'part' && e.name === part.typeRef && !e.typeRef,
  )
  if (!typeDef) return null
  return iconFromChildren(typeDef.children || [], semantic, attrName)
}

/** Header icon: `attribute _icon = "…"`. */
export function readPartIconName(
  semantic: Record<string, SemanticElement | undefined>,
  partId: string,
): string | null {
  return readPartIconAttr(semantic, partId, PART_ICON_ATTR)
}

/** Body icon: `attribute _icon_body = "…"`. */
export function readPartIconBodyName(
  semantic: Record<string, SemanticElement | undefined>,
  partId: string,
): string | null {
  return readPartIconAttr(semantic, partId, PART_ICON_BODY_ATTR)
}
