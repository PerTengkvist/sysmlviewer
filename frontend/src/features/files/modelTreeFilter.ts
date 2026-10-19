/**
 * Persist which ArtifactKinds are visible in the Model tree (left sidebar).
 * Default: all non-relation kinds present in the project are visible.
 */
import type { ArtifactKind, SemanticElement } from '../../api'
import { isRelationElement } from '../diagram/relationKinds'

const STORAGE_PREFIX = 'sysmlviewer.modelTreeKindFilter.'

/** Kinds that can appear as rows in the Model tree (excludes relations). */
export function treeKindsInSemantic(
  semantic: Record<string, SemanticElement>,
): ArtifactKind[] {
  const set = new Set<ArtifactKind>()
  for (const el of Object.values(semantic)) {
    if (!isRelationElement(el)) set.add(el.kind)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function loadModelTreeKindFilter(
  projectId: string,
  availableKinds: ArtifactKind[],
): Set<ArtifactKind> {
  if (!projectId || !availableKinds.length) {
    return new Set(availableKinds)
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId)
    if (!raw) return new Set(availableKinds)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(availableKinds)
    const allowed = new Set(
      parsed.filter(
        (k): k is ArtifactKind =>
          typeof k === 'string' && availableKinds.includes(k as ArtifactKind),
      ),
    )
    // New kinds that appear later default to visible.
    for (const k of availableKinds) {
      if (!parsed.includes(k) && allowed.size === parsed.length) {
        // If stored list was a full previous set, add new kinds.
      }
    }
    // If every stored kind was dropped (project changed), fall back to all.
    if (!allowed.size && availableKinds.length) {
      return new Set(availableKinds)
    }
    // Include kinds that were not in the saved list (new in this project).
    const savedAsSet = new Set(
      parsed.filter((k): k is string => typeof k === 'string'),
    )
    for (const k of availableKinds) {
      if (!savedAsSet.has(k)) allowed.add(k)
    }
    return allowed
  } catch {
    return new Set(availableKinds)
  }
}

export function saveModelTreeKindFilter(
  projectId: string,
  enabled: Iterable<ArtifactKind>,
): void {
  if (!projectId) return
  try {
    localStorage.setItem(
      STORAGE_PREFIX + projectId,
      JSON.stringify([...enabled].sort()),
    )
  } catch {
    // ignore quota / private mode
  }
}
