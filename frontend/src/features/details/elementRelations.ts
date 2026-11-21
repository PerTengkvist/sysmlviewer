import type { SemanticElement } from '../../api'
import { isRelationElement } from '../diagram/relationKinds'

export type RelationDirection = 'out' | 'in' | 'owned'

/** One relation of an element, seen from that element. */
export type ElementRelation = {
  relationId: string
  /** Stereotype word: objective, refine, derive, satisfy, include, … */
  label: string
  /** out: the element (or one of its ports) is the source; in: the target. */
  direction: RelationDirection
  /** The far end for out / in; null for owned relations between others. */
  otherId: string | null
  sourceId: string | null
  targetId: string | null
}

export type RequirementLink = { requirementId: string; label: string }
export type UseCaseLink = { useCaseId: string; label: string }

const DIRECTION_ORDER: Record<RelationDirection, number> = {
  out: 0,
  in: 1,
  owned: 2,
}

/** `refine` for `#refine dependency`, else the relation kind (`satisfy`). */
export function relationLabel(rel: SemanticElement): string {
  const keyword = (rel.metadataKeywords || [])[0]
  return keyword || rel.kind
}

/** Nearest ancestor of kind `occurrence` (an `occurrence def`), or null. */
export function owningOccurrenceId(
  semantic: Record<string, SemanticElement>,
  id: string,
): string | null {
  const seen = new Set<string>()
  let cur = semantic[id]?.parentId ?? null
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const el = semantic[cur]
    if (!el) return null
    if (el.kind === 'occurrence') return cur
    cur = el.parentId ?? null
  }
  return null
}

/** Names from the occurrence down to the element: `plant.actuator`. */
export function occurrencePath(
  semantic: Record<string, SemanticElement>,
  id: string,
): string | null {
  const occ = owningOccurrenceId(semantic, id)
  if (!occ) return null
  const names: string[] = []
  let cur: SemanticElement | undefined = semantic[id]
  while (cur && cur.id !== occ) {
    names.unshift(cur.name)
    cur = cur.parentId ? semantic[cur.parentId] : undefined
  }
  return names.join('.')
}

/**
 * `REQ-PERF-06 PowerModes` when the element has a short id. With the model, a
 * part inside an occurrence is named with it: `UnlockSequence.keyFob`.
 */
export function elementDisplayName(
  el: SemanticElement | undefined,
  id: string,
  semantic?: Record<string, SemanticElement>,
): string {
  if (!el) return id
  if (semantic) {
    const occ = owningOccurrenceId(semantic, id)
    if (occ) return `${semantic[occ].name}.${occurrencePath(semantic, id)}`
  }
  return el.shortId ? `${el.shortId} ${el.name}` : el.name
}

const KIND_KEYWORD: Partial<Record<SemanticElement['kind'], string>> = {
  useCase: 'use case',
  eventOccurrence: 'event occurrence',
}

/**
 * The SysML keyword for an element: `part`, `ref part`, `use case def`,
 * `abstract part def`. An unknown kind is shown as it is.
 */
export function elementTypeLabel(el: SemanticElement): string {
  const word = KIND_KEYWORD[el.kind] ?? el.kind
  if (el.isDefinition) {
    return el.isAbstract && el.kind === 'part' ? `abstract ${word} def` : `${word} def`
  }
  return el.kind === 'part' && el.isReference ? 'ref part' : word
}

export type RelatedElementLabel = {
  /** Element type keyword; null when the element is not in the model. */
  type: string | null
  shortId: string | null
  name: string
}

/** Type, short id and name of the far end of a relation. */
export function relatedElementLabel(
  semantic: Record<string, SemanticElement>,
  id: string,
): RelatedElementLabel {
  const el = semantic[id]
  if (!el) return { type: null, shortId: null, name: id }
  const occ = owningOccurrenceId(semantic, id)
  const name = occ ? `${semantic[occ].name}.${occurrencePath(semantic, id)}` : el.name
  return { type: elementTypeLabel(el), shortId: el.shortId || null, name }
}

export type FeatureTarget = {
  label: 'Subsets' | 'Redefines'
  relationId: string
  targetId: string
}

/** What a part subsets (`:>`) or redefines (`:>>`), from its relations. */
export function featureTargets(
  semantic: Record<string, SemanticElement>,
  id: string,
): FeatureTarget[] {
  const out: FeatureTarget[] = []
  for (const rel of Object.values(semantic)) {
    if (rel.sourceId !== id || !rel.targetId) continue
    if (rel.kind === 'subsetting') {
      out.push({ label: 'Subsets', relationId: rel.id, targetId: rel.targetId })
    } else if (rel.kind === 'redefinition') {
      out.push({ label: 'Redefines', relationId: rel.id, targetId: rel.targetId })
    }
  }
  return out
}

/** `keyFob (Car)`: a feature with the type or package that owns it. */
export function featureLabel(
  semantic: Record<string, SemanticElement>,
  id: string,
): string {
  const el = semantic[id]
  if (!el) return id
  const owner = el.parentId ? semantic[el.parentId] : undefined
  return owner ? `${el.name} (${owner.name})` : el.name
}

/**
 * Every relation the element takes part in, from the whole model:
 * outgoing (source is the element or one of its ports), incoming, and
 * relations it owns between other elements (for example connections
 * inside a part). Sorted out → in → owned, then by label and far end.
 */
export function elementRelations(
  semantic: Record<string, SemanticElement>,
  id: string,
): ElementRelation[] {
  const el = semantic[id]
  if (!el) return []
  const ends = new Set<string>([id])
  for (const cid of el.children || []) {
    if (semantic[cid]?.kind === 'port') ends.add(cid)
  }
  const out: ElementRelation[] = []
  for (const rel of Object.values(semantic)) {
    if (rel.id === id || !isRelationElement(rel)) continue
    const sourceId = rel.sourceId ?? null
    const targetId = rel.targetId ?? null
    const fromHere = !!sourceId && ends.has(sourceId)
    const toHere = !!targetId && ends.has(targetId)
    const owned = rel.parentId === id || (el.children || []).includes(rel.id)
    let direction: RelationDirection | null = null
    let otherId: string | null = null
    if (fromHere && !toHere) {
      direction = 'out'
      otherId = targetId
    } else if (toHere && !fromHere) {
      direction = 'in'
      otherId = sourceId
    } else if (owned || (fromHere && toHere)) {
      direction = 'owned'
    }
    if (!direction) continue
    out.push({
      relationId: rel.id,
      label: relationLabel(rel),
      direction,
      otherId,
      sourceId,
      targetId,
    })
  }
  return out.sort(
    (a, b) =>
      DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction] ||
      a.label.localeCompare(b.label) ||
      (a.otherId || a.relationId).localeCompare(b.otherId || b.relationId),
  )
}

/**
 * Requirements a use case traces to: objective, refine, derive, satisfy
 * (either direction), plus requirements declared inside the use case.
 */
export function useCaseRequirementLinks(
  semantic: Record<string, SemanticElement>,
  useCaseId: string,
): RequirementLink[] {
  const links: RequirementLink[] = []
  const seen = new Set<string>()
  const add = (requirementId: string, label: string) => {
    const key = `${requirementId}|${label}`
    if (seen.has(key)) return
    seen.add(key)
    links.push({ requirementId, label })
  }
  for (const rel of elementRelations(semantic, useCaseId)) {
    if (rel.otherId && semantic[rel.otherId]?.kind === 'requirement') {
      add(rel.otherId, rel.label)
    }
  }
  for (const req of Object.values(semantic)) {
    if (req.kind === 'requirement' && req.parentId === useCaseId) {
      add(req.id, 'requirement')
    }
  }
  return links
}

/** Use cases that trace to a requirement (the reverse of the above). */
export function requirementUseCaseLinks(
  semantic: Record<string, SemanticElement>,
  requirementId: string,
): UseCaseLink[] {
  const links: UseCaseLink[] = []
  const seen = new Set<string>()
  for (const rel of elementRelations(semantic, requirementId)) {
    if (!rel.otherId || semantic[rel.otherId]?.kind !== 'useCase') continue
    const key = `${rel.otherId}|${rel.label}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ useCaseId: rel.otherId, label: rel.label })
  }
  const owner = semantic[requirementId]?.parentId
  if (owner && semantic[owner]?.kind === 'useCase') {
    links.push({ useCaseId: owner, label: 'requirement' })
  }
  return links.sort((a, b) => a.useCaseId.localeCompare(b.useCaseId))
}
