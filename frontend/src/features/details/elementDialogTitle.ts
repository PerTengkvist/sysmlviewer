import type { SemanticElement } from '../../api'
import type { RequirementDisplaySettings } from '../../settings'
import {
  DEFAULT_REQUIREMENT_DISPLAY,
  resolveRequirementHeader,
} from '../diagram/requirementDisplay'

export type ElementDialogTitle = { kind: string; name: string }

/**
 * Header text for the element dialog: `«kind» name`. Requirements use the
 * same header as the requirement node (shortId + name by default), falling
 * back to the plain name when the configured header is empty.
 */
export function elementDialogTitle(
  elementId: string,
  semantic: Record<string, SemanticElement | undefined>,
  requirementDisplay: RequirementDisplaySettings = DEFAULT_REQUIREMENT_DISPLAY,
): ElementDialogTitle {
  const el = semantic[elementId]
  if (!el) return { kind: 'element', name: elementId }
  if (el.kind === 'requirement') {
    const header = resolveRequirementHeader(
      el,
      semantic as Record<string, SemanticElement>,
      requirementDisplay,
    )
    return { kind: el.kind, name: header || el.name || elementId }
  }
  return { kind: el.kind, name: el.name || elementId }
}
