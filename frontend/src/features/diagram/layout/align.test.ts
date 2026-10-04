import { describe, expect, it } from 'vitest'
import {
  alignDirectConnection,
  alignSelection,
  canAlignDirectConnection,
  portAbsPoint,
  type AlignableNode,
  type PartBox,
} from './align'

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

describe('alignDirectConnection', () => {
  const left: PartBox = { id: 'A', x: 0, y: 0, width: 100, height: 100 }
  const right: PartBox = { id: 'B', x: 200, y: 20, width: 100, height: 100 }
  const above: PartBox = { id: 'A', x: 0, y: 0, width: 100, height: 80 }
  const below: PartBox = { id: 'B', x: 20, y: 200, width: 100, height: 80 }

  // Source Y=75 lands inside B's body band (B at y=20 → band ~68–112).
  const srcRight = { id: 'A::out', side: 'right' as const, offset: 0.75 }
  const tgtLeft = { id: 'B::in', side: 'left' as const, offset: 0.3 }
  const srcBottom = { id: 'A::out', side: 'bottom' as const, offset: 0.4 }
  const tgtTop = { id: 'B::in', side: 'top' as const, offset: 0.7 }

  it('sameY is possible when move end can reach source Y', () => {
    expect(
      canAlignDirectConnection('sameY', left, right, srcRight, tgtLeft),
    ).toBe(true)
  })

  it('sameY is impossible when parts do not overlap in Y for source', () => {
    expect(
      canAlignDirectConnection('sameY', above, below, srcBottom, tgtTop),
    ).toBe(false)
  })

  it('sameX is possible when move end can reach source X', () => {
    expect(
      canAlignDirectConnection('sameX', above, below, srcBottom, tgtTop),
    ).toBe(true)
  })

  it('sameX is impossible when parts do not overlap in X for source', () => {
    expect(
      canAlignDirectConnection('sameX', left, right, srcRight, tgtLeft),
    ).toBe(false)
  })

  it('sameY keeps source port fixed and moves target to source Y', () => {
    const { possible, patch } = alignDirectConnection(
      'sameY',
      left,
      right,
      srcRight,
      tgtLeft,
    )
    expect(possible).toBe(true)
    expect(patch['A::out']).toBeUndefined()
    expect(patch['B::in']?.side).toBe('left')
    const ySrc = portAbsPoint(left, srcRight).y
    const yTgt =
      right.y + Number(patch['B::in']?.offset) * right.height
    expect(yTgt).toBeCloseTo(ySrc)
  })

  it('sameX keeps source port fixed and moves target to source X', () => {
    const { possible, patch } = alignDirectConnection(
      'sameX',
      above,
      below,
      srcBottom,
      tgtTop,
    )
    expect(possible).toBe(true)
    expect(patch['A::out']).toBeUndefined()
    expect(patch['B::in']?.side).toBe('top')
    const xSrc = portAbsPoint(above, srcBottom).x
    const xTgt =
      below.x + Number(patch['B::in']?.offset) * below.width
    expect(xTgt).toBeCloseTo(xSrc)
  })

  it('tgt anchor keeps target fixed and moves source', () => {
    const { possible, patch } = alignDirectConnection(
      'sameY',
      left,
      right,
      srcRight,
      tgtLeft,
      'tgt',
    )
    expect(possible).toBe(true)
    expect(patch['B::in']).toBeUndefined()
    expect(patch['A::out']?.side).toBe('right')
    const yTgt = portAbsPoint(right, tgtLeft).y
    const ySrc =
      left.y + Number(patch['A::out']?.offset) * left.height
    expect(ySrc).toBeCloseTo(yTgt)
  })

  it('returns empty patch when impossible', () => {
    const { possible, patch } = alignDirectConnection(
      'sameX',
      left,
      right,
      srcRight,
      tgtLeft,
    )
    expect(possible).toBe(false)
    expect(patch).toEqual({})
  })
})
