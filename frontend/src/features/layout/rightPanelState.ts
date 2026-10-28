export type PanelSizes = [number, number, number]

export type RightPanelState = {
  collapsed: boolean
  /** Remembered [left, center, right] percentages while expanded. */
  sizes: PanelSizes
}

/** Below this share the right panel counts as collapsed (library reports 0). */
const COLLAPSED_THRESHOLD = 1

export function toggleRightPanel(state: RightPanelState): RightPanelState {
  return { ...state, collapsed: !state.collapsed }
}

/**
 * Fold a layout report from the panel group into the state. A near-zero
 * right panel never overwrites the remembered sizes; if it happens while
 * expanded the user dragged the panel shut, so flip to collapsed. A visible
 * right panel while collapsed means it was dragged open, so flip back.
 */
export function applyLayoutChange(
  state: RightPanelState,
  layout: PanelSizes,
): RightPanelState {
  const rightIsCollapsed = layout[2] < COLLAPSED_THRESHOLD
  if (rightIsCollapsed) {
    return state.collapsed ? state : { ...state, collapsed: true }
  }
  // Visible right panel: either a plain resize, or the user dragged the
  // collapsed panel open again.
  return { collapsed: false, sizes: layout }
}
