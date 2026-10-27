import { describe, expect, it } from 'vitest'
import { chooseSideAmong, peerVectorForPort } from './portSideChoice'

describe('chooseSideAmong', () => {
  it('picks the side whose normal best matches the vector', () => {
    const all = ['left', 'right', 'top', 'bottom'] as const
    expect(chooseSideAmong([...all], { x: 10, y: 0 })).toBe('right')
    expect(chooseSideAmong([...all], { x: -10, y: 1 })).toBe('left')
    expect(chooseSideAmong([...all], { x: 0, y: -10 })).toBe('top')
    expect(chooseSideAmong([...all], { x: 1, y: 10 })).toBe('bottom')
  })

  it('only considers allowed sides', () => {
    expect(chooseSideAmong(['left', 'right'], { x: 0.5, y: -40 })).toBe('right')
    expect(chooseSideAmong(['left', 'right', 'bottom'], { x: 0, y: -40 })).toBe(
      'left',
    )
    expect(chooseSideAmong(['left', 'right', 'bottom'], { x: 3, y: 40 })).toBe(
      'bottom',
    )
  })

  it('keeps the current side on a zero vector when allowed, else the first', () => {
    expect(chooseSideAmong(['left', 'right'], { x: 0, y: 0 }, 'right')).toBe('right')
    expect(chooseSideAmong(['left', 'right'], { x: 0, y: 0 }, 'top')).toBe('left')
    expect(chooseSideAmong(['left', 'right'], { x: 0, y: 0 })).toBe('left')
  })

  it('is deterministic on ties (first allowed wins)', () => {
    expect(chooseSideAmong(['left', 'right'], { x: 0, y: 5 })).toBe('left')
    expect(chooseSideAmong(['right', 'left'], { x: 0, y: 5 })).toBe('right')
  })
})

describe('peerVectorForPort', () => {
  const rects = new Map([
    ['a', { x: 0, y: 0, width: 100, height: 60 }],
    ['b', { x: 300, y: 0, width: 100, height: 60 }],
    ['c', { x: 0, y: 300, width: 100, height: 60 }],
  ])
  const links = [
    { sourcePart: 'a', targetPart: 'b', sourcePort: 'a.p', targetPort: 'b.q' },
    { sourcePart: 'c', targetPart: 'a', sourcePort: 'c.r', targetPort: 'a.p' },
  ]

  it('sums centre-to-centre vectors to all peers of the port', () => {
    const v = peerVectorForPort('a.p', 'a', links, (id) => rects.get(id) ?? null)
    expect(v).toEqual({ x: 300, y: 300, n: 2 })
  })

  it('ignores links of other ports and missing peers', () => {
    const v = peerVectorForPort('b.q', 'b', links, (id) =>
      id === 'b' ? rects.get(id)! : null,
    )
    expect(v).toEqual({ x: 0, y: 0, n: 0 })
  })

  it('uses a point resolver for boundary peers when given', () => {
    const v = peerVectorForPort(
      'a.p',
      'a',
      [{ sourcePart: 'a', targetPart: 'root', sourcePort: 'a.p', targetPort: 'root.x' }],
      (id) => rects.get(id) ?? null,
      (portId) => (portId === 'root.x' ? { x: 50, y: -200 } : null),
    )
    expect(v).toEqual({ x: 0, y: -230, n: 1 })
  })
})
