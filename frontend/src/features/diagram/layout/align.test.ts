import { describe, expect, it } from 'vitest'
import { alignSelection, type AlignableNode } from './align'

describe('alignSelection', () => {
  const nodes: AlignableNode[] = [
    { id: 'a', x: 0, y: 0, width: 100, height: 40 },
    { id: 'b', x: 200, y: 80, width: 100, height: 40 },
    { id: 'c', x: 50, y: 20, width: 80, height: 40, parentAbs: { x: 100, y: 100 } },
  ]

  it('returns empty patch when fewer than 2 selected', () => {
    expect(alignSelection(nodes, 'horizontal', ['a']).patch).toEqual({})
  })

  it('aligns horizontally to first selected center Y', () => {
    const { patch } = alignSelection(nodes, 'horizontal', ['a', 'b'])
    expect(patch.a).toBeUndefined()
    expect(patch.b?.y).toBe(0)
    expect(patch.b?.x).toBe(200)
    expect(patch.b?.width).toBe(100)
    expect(patch.b?.height).toBe(40)
  })

  it('aligns vertically to first selected center X', () => {
    const { patch } = alignSelection(nodes, 'vertical', ['a', 'b'])
    expect(patch.b?.x).toBe(0)
    expect(patch.b?.y).toBe(80)
  })

  it('converts nested node to relative coords', () => {
    const { patch } = alignSelection(nodes, 'horizontal', ['a', 'c'])
    // anchor center Y = 20; child abs Y should be 20 - 20 = 0 → relative y = 0 - 100 = -100
    expect(patch.c?.y).toBe(-100)
  })

  it('aligns top/bottom port offset on vertical; skips left port', () => {
    const items: AlignableNode[] = [
      { id: 'p1', x: 0, y: 0, width: 200, height: 100, kind: 'port', side: 'top', offset: 0.2, parentAbs: { x: 0, y: 0 } },
      { id: 'p2', x: 0, y: 0, width: 200, height: 100, kind: 'port', side: 'top', offset: 0.8, parentAbs: { x: 0, y: 0 } },
      { id: 'p3', x: 0, y: 0, width: 200, height: 100, kind: 'port', side: 'left', offset: 0.5, parentAbs: { x: 0, y: 0 } },
    ]
    const { patch, skipped } = alignSelection(items, 'vertical', ['p1', 'p2', 'p3'])
    expect(patch.p2?.offset).toBeCloseTo(0.2)
    expect(skipped).toContain('p3')
  })
})
