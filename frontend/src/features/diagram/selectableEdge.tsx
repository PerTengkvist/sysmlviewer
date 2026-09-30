import { SmoothStepEdge, StraightEdge, type EdgeProps } from '@xyflow/react'
import type { ComponentType } from 'react'
import { selectedEdgeStyle } from './selectedEdgeStyle'

type HighlightData = {
  selectedColor?: string
  selectedFactor?: number
}

/** Default React Flow edge with the same selection highlight as structure edges. */
function withSelectionHighlight(EdgeImpl: ComponentType<EdgeProps>) {
  function HighlightedEdge(props: EdgeProps) {
    const data = (props.data || {}) as HighlightData
    return (
      <EdgeImpl
        {...props}
        interactionWidth={24}
        style={selectedEdgeStyle(
          props.style,
          !!props.selected,
          data.selectedColor,
          data.selectedFactor,
        )}
      />
    )
  }
  HighlightedEdge.displayName = `Highlighted(${EdgeImpl.displayName || EdgeImpl.name || 'Edge'})`
  return HighlightedEdge
}

export const HighlightedSmoothStepEdge = withSelectionHighlight(SmoothStepEdge)
export const HighlightedStraightEdge = withSelectionHighlight(StraightEdge)
