import type { StructureNotation } from '../../settings'

/** Normalize structure notation for visualization PATCH bodies. */
export function structureNotationForPatch(
  structureNotation: StructureNotation | undefined | null,
): StructureNotation {
  return structureNotation === 'arcadia' ? 'arcadia' : 'sysmlv2'
}

/**
 * Simulates useCallback that must list structureNotation in its deps.
 * A closed-over settings object that is not in deps goes stale after a switch.
 */
export function makeNotationPatchGetter(
  structureNotation: StructureNotation,
): () => StructureNotation {
  return () => structureNotationForPatch(structureNotation)
}
