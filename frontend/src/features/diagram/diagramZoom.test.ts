import { describe, expect, it } from 'vitest'
import {
  DIAGRAM_MAX_ZOOM,
  DIAGRAM_MIN_ZOOM,
  diagramFitOptions,
  diagramZoomLimits,
} from './diagramZoom'

describe('diagram zoom limits', () => {
  it('lets the user zoom out to 5 %', () => {
    expect(DIAGRAM_MIN_ZOOM).toBe(0.05)
    expect(diagramZoomLimits(false)).toEqual({
      minZoom: DIAGRAM_MIN_ZOOM,
      maxZoom: DIAGRAM_MAX_ZOOM,
    })
  })

  it('fit view may zoom out as far as the user can', () => {
    expect(diagramFitOptions(false)).toEqual({
      padding: 0.15,
      minZoom: DIAGRAM_MIN_ZOOM,
      maxZoom: DIAGRAM_MAX_ZOOM,
    })
  })

  it('keeps the wider print limits', () => {
    expect(diagramZoomLimits(true)).toEqual({ minZoom: 0.01, maxZoom: 8 })
    expect(diagramFitOptions(true)).toEqual({ padding: 0.04, minZoom: 0.01, maxZoom: 8 })
  })
})
