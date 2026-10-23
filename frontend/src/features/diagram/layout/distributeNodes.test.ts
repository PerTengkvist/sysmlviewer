import { describe, expect, it } from 'vitest'
import type { AlignableNode } from './align'
import { distributeSelection } from './distributeNodes'

describe('distributeSelection', () => {
  const nodes: AlignableNode[] = [
    { id: 'a', x: 0, y: 0, width: 40, height: 40 },
    { id: 'b', x: 50, y: 10, width: 40, height: 40 },
    { id: 'c', x: 200, y: 0, width: 40, height: 40 },
  ]

  it('returns empty when fewer than 3 selected', () => {
    expect(distributeSelection(nodes, 'horizontal', ['a', 'c']).patch).toEqual(
      {},
    )
  })

  it('keeps extremes fixed and spaces the middle center on X', () => {
    const { patch } = distributeSelection(nodes, 'horizontal', [
      'a',
      'b',
      'c',
    ])
    expect(patch.a).toBeUndefined()
    expect(patch.c).toBeUndefined()
    // centers: a=20, c=220 → mid should be at 120 → x = 120 - 20 = 100
    expect(patch.b?.x).toBe(100)
    expect(patch.b?.y).toBe(10)
  })

  it('spaces along Y for vertical', () => {
    const tall: AlignableNode[] = [
      { id: 'a', x: 0, y: 0, width: 20, height: 20 },
      { id: 'b', x: 5, y: 30, width: 20, height: 20 },
      { id: 'c', x: 0, y: 100, width: 20, height: 20 },
    ]
    const { patch } = distributeSelection(tall, 'vertical', ['a', 'b', 'c'])
    // centers: a=10, c=110 → mid=60 → y = 60 - 10 = 50
    expect(patch.b?.y).toBe(50)
    expect(patch.b?.x).toBe(5)
  })

  it('converts nested nodes to parent-relative coords', () => {
    const nested: AlignableNode[] = [
      { id: 'a', x: 0, y: 0, width: 40, height: 40 },
      {
        id: 'b',
        x: 10,
        y: 0,
        width: 40,
        height: 40,
        parentAbs: { x: 50, y: 0 },
      },
      { id: 'c', x: 300, y: 0, width: 40, height: 40 },
    ]
    // abs centers: a=20, b=50+10+20=80, c=320
    const { patch } = distributeSelection(nested, 'horizontal', [
      'a',
      'b',
      'c',
    ])
    // mid center = (20+320)/2 = 170 → abs x = 150 → relative = 150 - 50 = 100
    expect(patch.b?.x).toBe(100)
  })
})
