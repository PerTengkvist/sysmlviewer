import type { SemanticElement } from '../../api'

export type RequirementSlotSource =
  | { kind: 'sysml'; field: 'shortId' | 'name' }
  | { kind: 'attribute'; name: string }
  | { kind: 'none' }

export type RequirementBodySource =
  | { kind: 'doc' }
  | { kind: 'attribute'; name: string }

export type RequirementDisplaySettings = {
  /** Default: shortId + name. */
  headerSlots: [RequirementSlotSource, RequirementSlotSource]
  /** Default: SysML doc block. */
  body: RequirementBodySource
  /**
   * Attribute shown in Documentation panel when no .md file exists.
   * Default `'description'`. Null disables attribute fallback.
   */
  documentationPanelAttribute: string | null
}

export const DEFAULT_REQUIREMENT_DISPLAY: RequirementDisplaySettings = {
  headerSlots: [
    { kind: 'sysml', field: 'shortId' },
    { kind: 'sysml', field: 'name' },
  ],
  body: { kind: 'doc' },
  documentationPanelAttribute: 'description',
}

/** Strip surrounding quotes from attribute default values. */
export function stripQuotes(raw: string | null | undefined): string {
  if (raw == null) return ''
  const t = String(raw).trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

export function attributeValue(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  name: string,
): string {
  if (!name) return ''
  for (const cid of el.children || []) {
    const c = semantic[cid]
    if (c?.kind === 'attribute' && c.name === name) {
      return stripQuotes(c.defaultValue)
    }
  }
  return ''
}

function slotText(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  slot: RequirementSlotSource,
): string {
  if (slot.kind === 'none') return ''
  if (slot.kind === 'sysml') {
    if (slot.field === 'shortId') return el.shortId || ''
    return el.name || ''
  }
  return attributeValue(el, semantic, slot.name)
}

export function resolveRequirementHeader(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  settings: RequirementDisplaySettings = DEFAULT_REQUIREMENT_DISPLAY,
): string {
  const parts = settings.headerSlots
    .map((slot) => slotText(el, semantic, slot))
    .filter(Boolean)
  return parts.join(' ')
}

export function resolveRequirementBody(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  settings: RequirementDisplaySettings = DEFAULT_REQUIREMENT_DISPLAY,
): string {
  if (settings.body.kind === 'doc') {
    return el.documentation || ''
  }
  return attributeValue(el, semantic, settings.body.name)
}

/**
 * When an md file exists the panel loads it (return null).
 * Otherwise return the configured attribute value, or null if missing/disabled.
 */
export function resolveRequirementDocPanel(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  settings: RequirementDisplaySettings = DEFAULT_REQUIREMENT_DISPLAY,
  hasMdFile: boolean,
): string | null {
  if (hasMdFile) return null
  const attr = settings.documentationPanelAttribute
  if (!attr) return null
  const value = attributeValue(el, semantic, attr)
  return value || null
}

function parseSlot(raw: unknown): RequirementSlotSource {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'none' }
  }
  const o = raw as { kind?: string; field?: string; name?: string }
  if (o.kind === 'none') return { kind: 'none' }
  if (o.kind === 'sysml' && (o.field === 'shortId' || o.field === 'name')) {
    return { kind: 'sysml', field: o.field }
  }
  if (o.kind === 'attribute' && typeof o.name === 'string' && o.name.trim()) {
    return { kind: 'attribute', name: o.name.trim() }
  }
  return { kind: 'none' }
}

function parseBody(raw: unknown): RequirementBodySource {
  if (!raw || typeof raw !== 'object') return { kind: 'doc' }
  const o = raw as { kind?: string; name?: string }
  if (o.kind === 'attribute' && typeof o.name === 'string' && o.name.trim()) {
    return { kind: 'attribute', name: o.name.trim() }
  }
  return { kind: 'doc' }
}

/** Normalize persisted / partial settings into a full RequirementDisplaySettings. */
export function normalizeRequirementDisplay(
  raw: unknown,
): RequirementDisplaySettings {
  const d = DEFAULT_REQUIREMENT_DISPLAY
  if (!raw || typeof raw !== 'object') {
    return {
      headerSlots: [...d.headerSlots],
      body: { ...d.body },
      documentationPanelAttribute: d.documentationPanelAttribute,
    }
  }
  const o = raw as {
    headerSlots?: unknown
    body?: unknown
    documentationPanelAttribute?: unknown
  }
  const slots = Array.isArray(o.headerSlots) ? o.headerSlots : []
  const slot0 = slots[0] != null ? parseSlot(slots[0]) : d.headerSlots[0]
  const slot1 = slots[1] != null ? parseSlot(slots[1]) : d.headerSlots[1]
  let documentationPanelAttribute: string | null = d.documentationPanelAttribute
  if (o.documentationPanelAttribute === null) {
    documentationPanelAttribute = null
  } else if (typeof o.documentationPanelAttribute === 'string') {
    const t = o.documentationPanelAttribute.trim()
    documentationPanelAttribute = t || null
  }
  return {
    headerSlots: [slot0, slot1],
    body: parseBody(o.body),
    documentationPanelAttribute,
  }
}
