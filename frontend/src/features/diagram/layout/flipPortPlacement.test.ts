import { describe, expect, it } from 'vitest'
import {
  flipPortList,
  flipPortPlacement,
} from './flipPortPlacement'

describe('flipPortPlacement', () => {
  it('horizontal flip mirrors across the vertical center line', () => {
    expect(flipPortPlacement({ side: 'left', offset: 0.4 }, 'horizontal')).toEqual({
      side: 'right',
      offset: 0.4,
    })
    const top = flipPortPlacement({ side: 'top', offset: 0.2 }, 'horizontal')
    expect(top.side).toBe('top')
    expect(top.offset).toBeCloseTo(0.8)
  })

  it('vertical flip mirrors across the horizontal center line', () => {
    expect(flipPortPlacement({ side: 'top', offset: 0.4 }, 'vertical').side).toBe(
      'bottom',
    )
    const left = flipPortPlacement(
      { side: 'left', offset: 0.3 },
      'vertical',
      120,
      { isBoundary: true },
    )
    expect(left.side).toBe('left')
    expect(left.offset).toBeCloseTo(0.7, 5)
  })
})

describe('flipPortList', () => {
  it('flips every live port on the part', () => {
    const next = flipPortList(
      [
        { id: 'a', side: 'left', offset: 0.3 },
        { id: 'b', side: 'right', offset: 0.7 },
      ],
      'horizontal',
      120,
      { isBoundary: true },
    )
    expect(next).toEqual([
      { id: 'a', side: 'right', offset: 0.3 },
      { id: 'b', side: 'left', offset: 0.7 },
    ])
  })
})
