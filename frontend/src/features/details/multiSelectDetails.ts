import type {
  ElementStyle,
  ElementStyleMode,
  SemanticElement,
  VisualizationNode,
} from '../../api'
import type { ViewMode } from '../../settings'

/** Selected ids that are parts, when at least two parts are selected. */
export function multiPartSelection(
  selectedIds: string[],
  semantic: Record<string, SemanticElement> | undefined | null,
): string[] | null {
  if (!semantic || selectedIds.length < 2) return null
  const parts = selectedIds.filter((id) => semantic[id]?.kind === 'part')
  return parts.length >= 2 ? parts : null
}

/** Merge a mode patch into an existing element style. */
export function mergeStylePatch(
  existing: ElementStyle | null | undefined,
  mode: ViewMode,
  patch: Partial<ElementStyleMode>,
): ElementStyle {
  const prev = existing || {}
  const current = (mode === 'dark' ? prev.dark : prev.light) || {}
  const merged: ElementStyleMode = { ...current, ...patch }
  return {
    ...prev,
    [mode]: merged,
  }
}

/** Shared numeric field value across nodes, or null when they differ / missing. */
export function sharedNumericField(
  ids: string[],
  nodes: Record<string, VisualizationNode | undefined>,
  field: 'width' | 'height',
): number | null {
  const values = ids
    .map((id) => nodes[id]?.[field])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!values.length) return null
  const first = Math.round(values[0]!)
  return values.every((v) => Math.round(v) === first) ? first : null
}
