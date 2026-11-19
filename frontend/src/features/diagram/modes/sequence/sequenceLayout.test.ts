import { describe, expect, it } from 'vitest'
import {
  LIFELINE_GAP,
  defaultLifelineOrder,
  defaultLifelineWidth,
  layoutSequence,
  minLifelineWidth,
  orderAfterDrop,
  packLifelines,
  resolveLifelineOrder,
  resolveLifelineWidth,
} from './sequenceLayout'

describe('defaultLifelineOrder', () => {
  it('orders by first message sent or received, in declaration order', () => {
    const order = defaultLifelineOrder(
      ['a', 'b', 'c', 'd'],
      [
        { sourceId: 'c', targetId: 'a', label: 'x' },
        { sourceId: 'a', targetId: 'd', label: 'y' },
      ],
    )
    expect(order).toEqual(['c', 'a', 'd', 'b'])
  })

  it('puts lifelines without messages last, in declaration order', () => {
    const order = defaultLifelineOrder(
      ['z', 'y', 'b', 'a'],
      [{ sourceId: 'a', targetId: 'b', label: 'm' }],
    )
    expect(order).toEqual(['a', 'b', 'z', 'y'])
  })

  it('ignores message ends that are not lifelines', () => {
    expect(
      defaultLifelineOrder(['a', 'b'], [{ sourceId: 'q', targetId: 'b', label: '' }]),
    ).toEqual(['b', 'a'])
  })
})

describe('resolveLifelineOrder', () => {
  it('uses the saved order, drops missing ids, appends new ones by default order', () => {
    expect(resolveLifelineOrder(['a', 'b', 'c', 'd'], ['c', 'gone', 'a'])).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })
  it('falls back to the default without a saved order', () => {
    expect(resolveLifelineOrder(['a', 'b'], undefined)).toEqual(['a', 'b'])
  })
})

describe('widths', () => {
  it('default width fits the name on one line with a margin', () => {
    const w = defaultLifelineWidth('Driver')
    expect(w).toBeGreaterThanOrEqual(80)
    expect(defaultLifelineWidth('ManeuvrabilityController')).toBeGreaterThan(
      defaultLifelineWidth('Driver'),
    )
    // inner width (width - 16) holds the whole name
    expect(w - 16).toBeGreaterThan('Driver'.length * 7.2)
    const long = defaultLifelineWidth('ManeuvrabilityController')
    expect(long - 16).toBeGreaterThan('ManeuvrabilityController'.length * 7.2)
  })

  it('min width is the widest camelCase segment plus margin', () => {
    expect(minLifelineWidth('ManeuvrabilityController')).toBeLessThan(
      defaultLifelineWidth('ManeuvrabilityController'),
    )
    expect(minLifelineWidth('ManeuvrabilityController')).toBeGreaterThan(
      minLifelineWidth('driveController'),
    )
  })

  it('clamps a saved width to the minimum', () => {
    const min = minLifelineWidth('ManeuvrabilityController')
    expect(resolveLifelineWidth('ManeuvrabilityController', 10)).toBe(min)
    expect(resolveLifelineWidth('ManeuvrabilityController', 300)).toBe(300)
    expect(resolveLifelineWidth('A', undefined)).toBe(defaultLifelineWidth('A'))
  })
})

describe('packLifelines', () => {
  it('places lifelines left to right without overlap and with the gap', () => {
    const xs = packLifelines(['a', 'b', 'c'], { a: 100, b: 120, c: 90 }, [])
    expect(xs.a).toBeLessThan(xs.b)
    expect(xs.b - (xs.a + 100)).toBe(LIFELINE_GAP)
    expect(xs.c - (xs.b + 120)).toBe(LIFELINE_GAP)
  })

  it('widens the gap only for a pair whose message label would not fit', () => {
    const widths = { a: 80, b: 80, c: 80 }
    const label = 'a-very-long-message-label-here'
    const xs = packLifelines(['a', 'b', 'c'], widths, [
      { sourceId: 'a', targetId: 'b', label },
    ])
    expect(xs.b - xs.a).toBeGreaterThanOrEqual(label.length * 7.2)
    expect(xs.c - (xs.b + 80)).toBe(LIFELINE_GAP)
  })

  it('counts both directions and ignores non-adjacent pairs', () => {
    const widths = { a: 80, b: 80, c: 80 }
    const label = 'long-label-over-two-lifelines'
    const xs = packLifelines(['a', 'b', 'c'], widths, [
      { sourceId: 'c', targetId: 'a', label },
    ])
    expect(xs.b - (xs.a + 80)).toBe(LIFELINE_GAP)
    const back = packLifelines(['a', 'b'], widths, [
      { sourceId: 'b', targetId: 'a', label },
    ])
    expect(back.b - back.a).toBeGreaterThanOrEqual(label.length * 7.2)
  })
})

describe('orderAfterDrop', () => {
  const centres = { a: 50, b: 200, c: 350 }
  it('moves the dragged lifeline to where its centre was dropped', () => {
    expect(orderAfterDrop(['a', 'b', 'c'], 'a', 260, centres)).toEqual(['b', 'a', 'c'])
    expect(orderAfterDrop(['a', 'b', 'c'], 'c', 10, centres)).toEqual(['c', 'a', 'b'])
    expect(orderAfterDrop(['a', 'b', 'c'], 'a', 900, centres)).toEqual(['b', 'c', 'a'])
  })
  it('keeps the order when dropped near the original place', () => {
    expect(orderAfterDrop(['a', 'b', 'c'], 'b', 215, centres)).toEqual(['a', 'b', 'c'])
  })
})

describe('layoutSequence', () => {
  it('uses a saved order and widths; every lifeline gets a position', () => {
    const r = layoutSequence(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      [{ sourceId: 'a', targetId: 'b', label: 'm' }],
      { order: ['b', 'a'], widths: { b: 200 } },
    )
    expect(r.order).toEqual(['b', 'a'])
    expect(r.widths.b).toBe(200)
    expect(r.xs.b).toBeLessThan(r.xs.a)
  })
})
