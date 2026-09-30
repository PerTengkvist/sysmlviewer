import { describe, expect, it } from 'vitest'
import { nodeInlineStyles, selectedEdgeStroke } from './elementStyle'

describe('selectedEdgeStroke', () => {
  it('multiplies base thickness by factor and uses highlight color', () => {
    const stroke = selectedEdgeStroke(
      { light: { lineThickness: 2 } },
      'light',
      { color: '#2563eb', factor: 3 },
    )
    expect(stroke.stroke).toBe('#2563eb')
    expect(stroke.strokeWidth).toBe(6)
  })

  it('uses custom thickness 1.5 with factor 3 → 4.5', () => {
    const stroke = selectedEdgeStroke(
      { light: { lineThickness: 1.5 } },
      'light',
      { color: '#ff0000', factor: 3 },
    )
    expect(stroke.strokeWidth).toBe(4.5)
    expect(stroke.stroke).toBe('#ff0000')
  })

  it('falls back to default edge thickness when style has none', () => {
    const stroke = selectedEdgeStroke(null, 'light', {
      color: '#2563eb',
      factor: 3,
    })
    expect(stroke.strokeWidth).toBe(6)
  })
})

describe('nodeInlineStyles', () => {
  const color = '#aabbcc'

  it('both on puts color on root, header and body', () => {
    const s = nodeInlineStyles(
      { light: { backgroundColor: color } },
      'light',
    )
    expect(s.root.backgroundColor).toBe(color)
    expect(s.header.backgroundColor).toBe(color)
    expect(s.body.backgroundColor).toBe(color)
  })

  it('header only colors header; body gets default', () => {
    const s = nodeInlineStyles(
      {
        light: {
          backgroundColor: color,
          backgroundHeader: true,
          backgroundBody: false,
        },
      },
      'light',
    )
    expect(s.root.backgroundColor).toBeUndefined()
    expect(s.header.backgroundColor).toBe(color)
    expect(s.body.backgroundColor).toBe('#ffffff')
  })

  it('body only colors body; header gets default', () => {
    const s = nodeInlineStyles(
      {
        light: {
          backgroundColor: color,
          backgroundHeader: false,
          backgroundBody: true,
        },
      },
      'light',
    )
    expect(s.header.backgroundColor).toBe('#ffffff')
    expect(s.body.backgroundColor).toBe(color)
  })

  it('both off uses defaults even when color is set', () => {
    const s = nodeInlineStyles(
      {
        light: {
          backgroundColor: color,
          backgroundHeader: false,
          backgroundBody: false,
        },
      },
      'light',
    )
    expect(s.root.backgroundColor).toBeUndefined()
    expect(s.header.backgroundColor).toBe('#ffffff')
    expect(s.body.backgroundColor).toBe('#ffffff')
  })
})
