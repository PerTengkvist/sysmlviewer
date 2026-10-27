import { describe, expect, it } from 'vitest'
import {
  collectFlipPortMoves,
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

describe('collectFlipPortMoves', () => {
  it('returns sync moves for selected parts only (ready to persist)', () => {
    const moves = collectFlipPortMoves(
      [
        {
          id: 'partA',
          height: 120,
          isBoundary: true,
          ports: [
            { id: 'p1', side: 'left', offset: 0.3 },
            { id: 'p2', side: 'right', offset: 0.6 },
          ],
        },
        {
          id: 'partB',
          height: 120,
          ports: [{ id: 'p3', side: 'left', offset: 0.5 }],
        },
      ],
      new Set(['partA']),
      'horizontal',
    )
    expect(moves).toEqual([
      { portId: 'p1', side: 'right', offset: 0.3 },
      { portId: 'p2', side: 'left', offset: 0.6 },
    ])
  })

  it('returns empty when no selected parts have ports', () => {
    expect(
      collectFlipPortMoves(
        [{ id: 'partA', ports: [] }],
        new Set(['partA']),
        'horizontal',
      ),
    ).toEqual([])
  })
})
