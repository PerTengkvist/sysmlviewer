/**
 * Map the active view id to the selection id used when the canvas pane
 * (background) is clicked — same as clicking that view/artifact in the tree.
 */
export function selectionIdForPaneClick(
  activeViewId: string | null,
): string | null {
  if (activeViewId == null) return null
  if (activeViewId.startsWith('artifact::')) {
    return activeViewId.slice('artifact::'.length)
  }
  return activeViewId
}
