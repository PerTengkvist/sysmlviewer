export type EdgeEditLayer =
  | 'leader'
  | 'segment'
  | 'waypoint'
  | 'label'
  | 'relationEnd'

const LAYER_BASE: Record<EdgeEditLayer, number> = {
  leader: 1000,
  segment: 1000,
  waypoint: 1001,
  label: 1002,
  relationEnd: 1003,
}

/** Boost so a selected edge's Option overlays sit above every unselected edge. */
const SELECTED_BOOST = 1000

/** CSS z-index for Option-mode edge edit overlays (EdgeLabelRenderer). */
export function edgeEditOverlayZIndex(
  selected: boolean,
  layer: EdgeEditLayer,
): number {
  const base = LAYER_BASE[layer]
  return selected ? base + SELECTED_BOOST : base
}

/**
 * React Flow edge zIndex while Option (port-move) mode is active.
 * Selected edges float above other edges so their paths and overlays stack correctly.
 */
export function edgeStackZIndex(altHeld: boolean, selected: boolean): number | undefined {
  if (!altHeld) return undefined
  return selected ? 1000 : 0
}
