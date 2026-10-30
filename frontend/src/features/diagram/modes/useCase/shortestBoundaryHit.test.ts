import { describe, expect, it } from 'vitest'
import { shortestBoundaryHit } from './shortestBoundaryHit'

describe('shortestBoundaryHit', () => {
  it('hits the right side when the peer is to the right', () => {
    const hit = shortestBoundaryHit(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
    )
    expect(hit.side).toBe('right')
    expect(hit.offset).toBeCloseTo(0.5, 5)
  })

  it('hits the left side when the peer is to the left', () => {
    const hit = shortestBoundaryHit(
      { x: 200, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    )
    expect(hit.side).toBe('left')
  })

  it('uses a non-mid offset when the peer is diagonally above', () => {
    const hit = shortestBoundaryHit(
      { x: 0, y: 100, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
    )
    expect(hit.side).toBe('right')
    expect(hit.offset).toBeLessThan(0.5)
  })

  it('gives the same hit for two peers that share a centre', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 }
    const peer = { x: 200, y: 0, width: 100, height: 100 }
    expect(shortestBoundaryHit(box, peer)).toEqual(
      shortestBoundaryHit(box, { ...peer, x: 300 }),
    )
  })
})
