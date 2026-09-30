/**
 * Multi-select helpers for diagram canvas.
 * Anchor (alignment reference) is always selectedIds[0].
 * Details panel uses the last clicked id (primary).
 */

export type SelectionState = {
  selectedIds: string[]
  /** Last clicked id for details panel; falls back to anchor. */
  primaryId: string | null
}

export function nextSelection(
  current: string[],
  clickedId: string | null,
  opts: { shift: boolean },
): SelectionState {
  if (clickedId == null) {
    return { selectedIds: [], primaryId: null }
  }
  if (!opts.shift) {
    return { selectedIds: [clickedId], primaryId: clickedId }
  }
  const idx = current.indexOf(clickedId)
  if (idx >= 0) {
    const selectedIds = current.filter((id) => id !== clickedId)
    return {
      selectedIds,
      primaryId: selectedIds.length
        ? selectedIds[selectedIds.length - 1]
        : null,
    }
  }
  const selectedIds = [...current, clickedId]
  return { selectedIds, primaryId: clickedId }
}

/**
 * After a marquee selection, set selectedIds from nodes/edges that are selected.
 * Anchor is the first match in `orderedIds` (diagram node list order).
 */
export function selectionFromFlow(orderedIds: string[]): SelectionState {
  if (!orderedIds.length) return { selectedIds: [], primaryId: null }
  return {
    selectedIds: [...orderedIds],
    primaryId: orderedIds[0],
  }
}

export function selectionAnchor(selectedIds: string[]): string | null {
  return selectedIds[0] ?? null
}
