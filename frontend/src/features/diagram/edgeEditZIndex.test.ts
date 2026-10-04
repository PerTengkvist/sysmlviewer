import { describe, expect, it } from 'vitest'
import { edgeEditOverlayZIndex, edgeStackZIndex } from './edgeEditZIndex'

describe('edgeEditOverlayZIndex', () => {
  it('keeps unselected layers in the 1000–1003 band', () => {
    expect(edgeEditOverlayZIndex(false, 'segment')).toBe(1000)
    expect(edgeEditOverlayZIndex(false, 'waypoint')).toBe(1001)
    expect(edgeEditOverlayZIndex(false, 'label')).toBe(1002)
    expect(edgeEditOverlayZIndex(false, 'relationEnd')).toBe(1003)
  })

  it('places every selected layer above every unselected layer', () => {
    const selectedLowest = edgeEditOverlayZIndex(true, 'segment')
    const unselectedHighest = edgeEditOverlayZIndex(false, 'relationEnd')
    expect(selectedLowest).toBeGreaterThan(unselectedHighest)
  })

  it('preserves relative order among selected layers', () => {
    expect(edgeEditOverlayZIndex(true, 'relationEnd')).toBeGreaterThan(
      edgeEditOverlayZIndex(true, 'label'),
    )
    expect(edgeEditOverlayZIndex(true, 'label')).toBeGreaterThan(
      edgeEditOverlayZIndex(true, 'waypoint'),
    )
  })
})

describe('edgeStackZIndex', () => {
  it('returns undefined when Option is not held', () => {
    expect(edgeStackZIndex(false, true)).toBeUndefined()
    expect(edgeStackZIndex(false, false)).toBeUndefined()
  })

  it('puts the selected edge above others while Option is held', () => {
    expect(edgeStackZIndex(true, true)).toBeGreaterThan(edgeStackZIndex(true, false)!)
  })
})
