/** SVG marker defs for Arcadia / SysML v1 composition & aggregation diamonds. */

export const FILLED_DIAMOND_MARKER_ID = 'sysml-filled-diamond'
export const HOLLOW_DIAMOND_MARKER_ID = 'sysml-hollow-diamond'

/**
 * Composition = filled (black) diamond; aggregation = hollow (stroke + white fill).
 * Ids must match strings returned by {@link reactFlowMarker}.
 */
export function EdgeMarkerDefs() {
  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* Tip at ref attaches to the whole/parent; body extends along the edge. */}
        <marker
          id={FILLED_DIAMOND_MARKER_ID}
          className="react-flow__arrowhead"
          viewBox="0 0 14 14"
          markerWidth="11"
          markerHeight="11"
          refX="0.5"
          refY="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0.5 7 L 7 1 L 13.5 7 L 7 13 Z"
            fill="#000"
            stroke="#000"
            strokeWidth="1"
            strokeLinejoin="miter"
          />
        </marker>
        <marker
          id={HOLLOW_DIAMOND_MARKER_ID}
          className="react-flow__arrowhead"
          viewBox="0 0 14 14"
          markerWidth="11"
          markerHeight="11"
          refX="0.5"
          refY="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0.5 7 L 7 1 L 13.5 7 L 7 13 Z"
            fill="#fff"
            stroke="#000"
            strokeWidth="1.25"
            strokeLinejoin="miter"
          />
        </marker>
      </defs>
    </svg>
  )
}
