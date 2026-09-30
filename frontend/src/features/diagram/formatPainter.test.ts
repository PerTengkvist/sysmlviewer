import { describe, expect, it } from 'vitest'
import { copyStyle } from './formatPainter'
import type { ElementStyle } from '../../api'

const style: ElementStyle = {
  light: { backgroundColor: '#ff0000', backgroundHeader: true, backgroundBody: false },
  dark: { backgroundColor: '#00ff00' },
}

describe('copyStyle', () => {
  it('copies light and dark from node to node', () => {
    const next = copyStyle(style, 'part', 'requirement')
    expect(next).toEqual(style)
    expect(next).not.toBe(style)
    expect(next!.light).not.toBe(style.light)
  })

  it('returns null for edge to node', () => {
    expect(copyStyle(style, 'connection', 'part')).toBeNull()
  })

  it('does not mutate source', () => {
    const next = copyStyle(style, 'part', 'part')!
    next.light!.backgroundColor = '#000'
    expect(style.light!.backgroundColor).toBe('#ff0000')
  })
})
