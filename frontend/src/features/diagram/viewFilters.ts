import type {
  ArtifactKind,
  SemanticElement,
  VisualizationEdge,
  VisualizationNode,
} from '../../api'
import { matchName } from './namePattern'
import { isRelationKind } from './relationKinds'

export type ViewFilterMatchField = 'name' | 'stereotype' | 'any'

export type ViewFilterRow = {
  id: string
  kind: ArtifactKind | string
  /** Which property the pattern matches. Defaults to name. */
  matchField?: ViewFilterMatchField
  namePattern: string
  enabled: boolean
}

export type FilteredVisualization = {
  nodes: Record<string, VisualizationNode>
  edges: Record<string, VisualizationEdge>
}

function stereotypeText(el: SemanticElement): string {
  return (el.metadataKeywords || []).join(', ')
}

function matchesPattern(
  el: SemanticElement,
  field: ViewFilterMatchField,
  pattern: string,
): boolean {
  const p = pattern || '*'
  if (field === 'name') return matchName(p, el.name)
  if (field === 'stereotype') {
    const keywords = el.metadataKeywords || []
    if (!keywords.length) return matchName(p, '')
    return keywords.some((kw) => matchName(p, kw)) || matchName(p, stereotypeText(el))
  }
  // any: name or stereotype
  if (matchName(p, el.name)) return true
  const keywords = el.metadataKeywords || []
  return keywords.some((kw) => matchName(p, kw)) || matchName(p, stereotypeText(el))
}

/**
 * Hide artefacts matching enabled filters (kind + field/pattern glob).
 * Relations whose endpoints are hidden are also removed. Ports under a
 * hidden part are removed. Hidden ids are stripped from children lists.
 */
export function applyViewFilters(
  semantic: Record<string, SemanticElement>,
  visualization: FilteredVisualization,
  filters: ViewFilterRow[],
): {
  semantic: Record<string, SemanticElement>
  visualization: FilteredVisualization
} {
  const active = filters.filter((f) => f.enabled)
  if (!active.length) {
    return { semantic, visualization }
  }

  const hidden = new Set<string>()

  const matchesFilter = (el: SemanticElement): boolean =>
    active.some((f) => {
      if (f.kind !== el.kind) return false
      const field: ViewFilterMatchField = f.matchField || 'name'
      return matchesPattern(el, field, f.namePattern || '*')
    })

  // First pass: directly matching elements
  for (const el of Object.values(semantic)) {
    if (matchesFilter(el)) hidden.add(el.id)
  }

  // Hide ports under hidden parents (and nested children)
  let grew = true
  while (grew) {
    grew = false
    for (const el of Object.values(semantic)) {
      if (hidden.has(el.id)) continue
      if (el.parentId && hidden.has(el.parentId)) {
        hidden.add(el.id)
        grew = true
      }
    }
  }

  // Hide relations that match or whose ends are hidden
  for (const el of Object.values(semantic)) {
    if (hidden.has(el.id)) continue
    if (
      !isRelationKind(el.kind) &&
      el.kind !== 'message' &&
      el.kind !== 'transition' &&
      el.kind !== 'succession'
    ) {
      continue
    }
    const src = el.sourceId
    const tgt = el.targetId
    if ((src && hidden.has(src)) || (tgt && hidden.has(tgt))) {
      hidden.add(el.id)
    }
  }

  if (!hidden.size) {
    return { semantic, visualization }
  }

  const nextSemantic: Record<string, SemanticElement> = {}
  for (const [id, el] of Object.entries(semantic)) {
    if (hidden.has(id)) continue
    nextSemantic[id] = {
      ...el,
      children: el.children.filter((c) => !hidden.has(c)),
    }
  }

  const nextNodes: Record<string, VisualizationNode> = {}
  for (const [id, n] of Object.entries(visualization.nodes)) {
    if (!hidden.has(id)) nextNodes[id] = n
  }
  const nextEdges: Record<string, VisualizationEdge> = {}
  for (const [id, e] of Object.entries(visualization.edges)) {
    if (!hidden.has(id)) nextEdges[id] = e
  }

  return {
    semantic: nextSemantic,
    visualization: { nodes: nextNodes, edges: nextEdges },
  }
}

/** Unique kinds present in the view semantic (for filter dropdowns). */
export function kindsInSemantic(
  semantic: Record<string, SemanticElement>,
): string[] {
  const kinds = new Set<string>()
  for (const el of Object.values(semantic)) {
    kinds.add(el.kind)
  }
  return [...kinds].sort()
}
