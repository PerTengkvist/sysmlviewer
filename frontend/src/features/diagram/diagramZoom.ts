/** How far the user can zoom out on a diagram (5 %). */
export const DIAGRAM_MIN_ZOOM = 0.05
export const DIAGRAM_MAX_ZOOM = 2

const PRINT_MIN_ZOOM = 0.01
const PRINT_MAX_ZOOM = 8

/** Zoom limits for the diagram canvas; printing may zoom further either way. */
export function diagramZoomLimits(printMode: boolean): { minZoom: number; maxZoom: number } {
  return printMode
    ? { minZoom: PRINT_MIN_ZOOM, maxZoom: PRINT_MAX_ZOOM }
    : { minZoom: DIAGRAM_MIN_ZOOM, maxZoom: DIAGRAM_MAX_ZOOM }
}

/** Fit view uses the same limits, so a large diagram fits on screen. */
export function diagramFitOptions(printMode: boolean): {
  padding: number
  minZoom: number
  maxZoom: number
} {
  return { padding: printMode ? 0.04 : 0.15, ...diagramZoomLimits(printMode) }
}
