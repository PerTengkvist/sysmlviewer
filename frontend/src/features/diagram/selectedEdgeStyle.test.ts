import { describe, expect, it } from 'vitest'
import { selectedEdgeStyle } from './selectedEdgeStyle'

describe('selectedEdgeStyle', () => {
  it('keeps the resting stroke until the edge is selected', () => {
    expect(
      selectedEdgeStyle({ stroke: '#333', strokeWidth: 1.5 }, false, '#2563eb', 3),
    ).toEqual({ stroke: '#333', strokeWidth: 1.5 })
  })

  it('thickens the stroke and uses the configured color', () => {
    expect(
      selectedEdgeStyle({ stroke: '#333', strokeWidth: 2 }, true, '#0ea5e9', 3),
    ).toEqual({ stroke: '#0ea5e9', strokeWidth: 6 })
  })
})
