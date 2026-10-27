import { describe, expect, it } from 'vitest'
import { orderWithinLayers, placeInLayerBands } from './layerBands'

const boxes = [
  { id: 'A', w: 100, h: 50 },
  { id: 'B', w: 200, h: 80 },
  { id: 'C', w: 100, h: 50 },
  { id: 'D', w: 120, h: 40 },
]

const layerOf = new Map([
  ['A', 0],
  ['B', 0],
  ['C', 1],
  ['D', 1],
])

const order = new Map([
  ['A', 0],
  ['B', 1],
  ['C', 0],
  ['D', 1],
])

describe('placeInLayerBands (top-down)', () => {
  const r = placeInLayerBands({
    direction: 'top-down',
    layerCount: 2,
    layerOf,
    order,
    boxes,
    gap: 20,
  })

  it('makes each band twice as thick as its tallest part and centres parts in it', () => {
    expect(r.bands[0]).toEqual({ index: 0, start: 0, size: 160 })
    expect(r.bands[1]).toEqual({ index: 1, start: 160, size: 100 })
    // A (h=50) centred in band 0: (160-50)/2 = 55; B (h=80): 40
    expect(r.positions.A.y).toBe(55)
    expect(r.positions.B.y).toBe(40)
    expect(r.positions.C.y).toBe(160 + 25)
    expect(r.positions.D.y).toBe(160 + 30)
  })

  it('centres every row on a common vertical axis in rule order', () => {
    // Row 0 width = 100 + 20 + 200 = 320; row 1 = 100 + 20 + 120 = 240.
    expect(r.width).toBe(320)
    expect(r.positions.A.x).toBe(0)
    expect(r.positions.B.x).toBe(120)
    expect(r.positions.C.x).toBe(40)
    expect(r.positions.D.x).toBe(160)
    expect(r.height).toBe(260)
  })
})

describe('placeInLayerBands (other directions)', () => {
  it('bottom-up puts layer 0 at the bottom', () => {
    const r = placeInLayerBands({
      direction: 'bottom-up',
      layerCount: 2,
      layerOf,
      order,
      boxes,
      gap: 20,
    })
    expect(r.bands[1].start).toBe(0)
    expect(r.bands[0].start).toBe(100)
    expect(r.positions.C.y).toBe(25)
    expect(r.positions.A.y).toBe(100 + 55)
  })

  it('left-right makes columns twice as wide as the widest part', () => {
    const r = placeInLayerBands({
      direction: 'left-right',
      layerCount: 2,
      layerOf,
      order,
      boxes,
      gap: 20,
    })
    expect(r.bands[0]).toEqual({ index: 0, start: 0, size: 400 })
    expect(r.bands[1]).toEqual({ index: 1, start: 400, size: 240 })
    expect(r.positions.A.x).toBe(150)
    expect(r.positions.B.x).toBe(100)
    // Column 0 height = 50 + 20 + 80 = 150; column 1 = 50 + 20 + 40 = 110.
    expect(r.height).toBe(150)
    expect(r.positions.A.y).toBe(0)
    expect(r.positions.B.y).toBe(70)
    expect(r.positions.C.y).toBe(20)
  })

  it('right-left puts layer 0 at the right', () => {
    const r = placeInLayerBands({
      direction: 'right-left',
      layerCount: 2,
      layerOf,
      order,
      boxes,
      gap: 20,
    })
    expect(r.bands[1].start).toBe(0)
    expect(r.bands[0].start).toBe(240)
  })

  it('keeps an empty layer as a thin band', () => {
    const r = placeInLayerBands({
      direction: 'top-down',
      layerCount: 3,
      layerOf: new Map([
        ['A', 0],
        ['B', 2],
      ]),
      order: new Map(),
      boxes: boxes.slice(0, 2),
      gap: 20,
    })
    // Band 0 = 2 × A.h = 100, empty band 1 = 2 × gap = 40.
    expect(r.bands[1].size).toBe(40)
    expect(r.bands[2].start).toBe(100 + 40)
  })

  it('applies an origin offset', () => {
    const r = placeInLayerBands({
      direction: 'top-down',
      layerCount: 2,
      layerOf,
      order,
      boxes,
      gap: 20,
      origin: { x: 48, y: 48 },
    })
    expect(r.positions.A).toEqual({ x: 48, y: 48 + 55 })
  })
})

describe('orderWithinLayers', () => {
  it('orders by constraints first, then by hint, then by id', () => {
    const order = orderWithinLayers(
      new Map([
        ['A', 0],
        ['B', 0],
        ['C', 0],
        ['D', 1],
      ]),
      [{ before: 'C', after: 'A', ruleId: 'r' }],
      new Map([
        ['A', 10],
        ['B', 5],
        ['C', 100],
      ]),
    )
    // Constraint C→A wins over C's larger hint; B stays first by hint.
    expect(order.get('B')).toBe(0)
    expect(order.get('C')).toBe(1)
    expect(order.get('A')).toBe(2)
    expect(order.get('D')).toBe(0)
  })

  it('ignores constraints across layers', () => {
    const order = orderWithinLayers(
      new Map([
        ['A', 0],
        ['B', 1],
      ]),
      [{ before: 'B', after: 'A', ruleId: 'r' }],
      new Map(),
    )
    expect(order.get('A')).toBe(0)
    expect(order.get('B')).toBe(0)
  })
})

describe('placeInLayerBands inside a container', () => {
  it('uses the container padding as origin and reports the content size', () => {
    const r = placeInLayerBands({
      direction: 'top-down',
      layerCount: 2,
      layerOf,
      order,
      boxes,
      gap: 20,
      origin: { x: 24, y: 48 },
    })
    expect(r.positions.A).toEqual({ x: 24, y: 48 + 55 })
    // Container size = origin + content + padding.
    expect(24 + r.width + 24).toBe(368)
    expect(48 + r.height + 24).toBe(332)
  })
})
