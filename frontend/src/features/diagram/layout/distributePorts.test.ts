import { describe, expect, it } from 'vitest'
import {
  collectDistributePortMoves,
  distributePortPlacements,
  portPointOnPart,
} from './distributePorts'

describe('portPointOnPart', () => {
  it('maps left/right via offset along height', () => {
    expect(portPointOnPart('left', 0.25, { width: 100, height: 200 })).toEqual({
      x: 0,
      y: 50,
    })
    expect(portPointOnPart('right', 0.5, { width: 100, height: 200 })).toEqual({
      x: 100,
      y: 100,
    })
  })
})

describe('distributePortPlacements', () => {
  it('returns empty for fewer than two ports', () => {
    expect(
      distributePortPlacements(
        [{ id: 'a', side: 'left', offset: 0.4 }],
        'vertical',
        { width: 100, height: 100 },
      ),
    ).toEqual({})
  })

  it('keeps extremes and spaces middle ports vertically', () => {
    const patch = distributePortPlacements(
      [
        { id: 'top', side: 'left', offset: 0.2 },
        { id: 'mid', side: 'left', offset: 0.25 },
        { id: 'bot', side: 'left', offset: 0.8 },
      ],
      'vertical',
      { width: 100, height: 100, isBoundary: true },
    )
    expect(patch.top).toEqual({ side: 'left', offset: 0.2 })
    expect(patch.bot).toEqual({ side: 'left', offset: 0.8 })
    expect(patch.mid?.side).toBe('left')
    expect(patch.mid?.offset).toBeCloseTo(0.5, 5)
  })

  it('spaces ports horizontally on top/bottom', () => {
    const patch = distributePortPlacements(
      [
        { id: 'a', side: 'top', offset: 0.1 },
        { id: 'b', side: 'top', offset: 0.15 },
        { id: 'c', side: 'top', offset: 0.9 },
      ],
      'horizontal',
      { width: 100, height: 80, isBoundary: true },
    )
    expect(patch.a?.offset).toBeCloseTo(0.1, 5)
    expect(patch.c?.offset).toBeCloseTo(0.9, 5)
    expect(patch.b?.offset).toBeCloseTo(0.5, 5)
  })
})

describe('collectDistributePortMoves', () => {
  it('returns sync PortMove list ready to persist', () => {
    const moves = collectDistributePortMoves(
      [
        { id: 'top', side: 'left', offset: 0.2 },
        { id: 'mid', side: 'left', offset: 0.25 },
        { id: 'bot', side: 'left', offset: 0.8 },
      ],
      'vertical',
      { width: 100, height: 100, isBoundary: true },
    )
    expect(moves.map((m) => m.portId).sort()).toEqual(['bot', 'mid', 'top'])
    const mid = moves.find((m) => m.portId === 'mid')
    expect(mid?.side).toBe('left')
    expect(mid?.offset).toBeCloseTo(0.5, 5)
  })
})
