import type { SemanticElement } from '../../../../api'
import {
  requirementStereotype,
  requirementTypeAttr,
} from '../../requirementStereotype'

export type RequirementRow = {
  id: string
  shortId: string
  name: string
  stereotype: string
  text: string
  derivedFrom: string[]
  satisfiedBy: string[]
  fileId: string | null
  depth: number
  repeated: boolean
}

export type RequirementTableMode = 'flat' | 'hierarchical'

function isRequirement(el: SemanticElement): boolean {
  return el.kind === 'requirement'
}

function deriveParents(
  semantic: Record<string, SemanticElement>,
): Map<string, string[]> {
  const parents = new Map<string, string[]>()
  for (const el of Object.values(semantic)) {
    if (!isRequirement(el)) continue
    if (el.parentId && semantic[el.parentId]?.kind === 'requirement') {
      const list = parents.get(el.id) || []
      list.push(el.parentId)
      parents.set(el.id, list)
    }
  }
  for (const el of Object.values(semantic)) {
    if (el.kind !== 'dependency') continue
    const meta = el.metadataKeywords || []
    if (!meta.includes('derive') && !meta.includes('refine')) continue
    if (!el.sourceId || !el.targetId) continue
    // source derives/refines from target (target is parent)
    const list = parents.get(el.sourceId) || []
    if (!list.includes(el.targetId)) list.push(el.targetId)
    parents.set(el.sourceId, list)
  }
  return parents
}

function satisfiedByMap(
  semantic: Record<string, SemanticElement>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const el of Object.values(semantic)) {
    if (el.kind !== 'satisfy' || !el.targetId || !el.sourceId) continue
    const list = map.get(el.targetId) || []
    list.push(el.sourceId)
    map.set(el.targetId, list)
  }
  return map
}

function toRow(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  depth: number,
  repeated: boolean,
  parents: Map<string, string[]>,
  sat: Map<string, string[]>,
): RequirementRow {
  const typeAttr = requirementTypeAttr(el, semantic)
  return {
    id: el.id,
    shortId: el.shortId || '',
    name: el.name,
    stereotype: requirementStereotype({ typeAttr }),
    text: el.documentation || '',
    derivedFrom: parents.get(el.id) || [],
    satisfiedBy: sat.get(el.id) || [],
    fileId: el.fileId,
    depth,
    repeated,
  }
}

export function buildRequirementRows(
  semantic: Record<string, SemanticElement>,
  mode: RequirementTableMode,
): RequirementRow[] {
  const reqs = Object.values(semantic)
    .filter(isRequirement)
    .sort((a, b) => (a.shortId || a.name).localeCompare(b.shortId || b.name))
  const parents = deriveParents(semantic)
  const sat = satisfiedByMap(semantic)

  if (mode === 'flat') {
    return reqs.map((el) => toRow(el, semantic, 0, false, parents, sat))
  }

  const rows: RequirementRow[] = []
  const seenInPath = new Set<string>()
  const emitted = new Set<string>()

  const roots = reqs.filter((r) => {
    const p = parents.get(r.id) || []
    return p.length === 0
  })

  const walk = (id: string, depth: number) => {
    const el = semantic[id]
    if (!el || !isRequirement(el)) return
    const repeated = emitted.has(id)
    if (seenInPath.has(id)) return // cycle
    rows.push(toRow(el, semantic, depth, repeated, parents, sat))
    emitted.add(id)
    seenInPath.add(id)
    const children = reqs
      .filter((r) => (parents.get(r.id) || []).includes(id))
      .map((r) => r.id)
    for (const cid of children) walk(cid, depth + 1)
    seenInPath.delete(id)
  }

  for (const root of roots) walk(root.id, 0)
  // Orphans already in a cycle-only component
  for (const r of reqs) {
    if (!emitted.has(r.id)) walk(r.id, 0)
  }
  return rows
}
