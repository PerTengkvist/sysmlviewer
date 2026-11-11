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

/** `REQ-PERF-06 PowerModes` when the element has a short id. */
export function elementDisplayName(el: SemanticElement | undefined, id: string): string {
  if (!el) return id
  return el.shortId ? `${el.shortId} ${el.name}` : el.name
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
