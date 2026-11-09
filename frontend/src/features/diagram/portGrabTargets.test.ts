import { describe, expect, it } from 'vitest'

import { portGrabTargets, samePortGrabTargets } from './portGrabTargets'

type Bounds = { id: string | null; x: number; y: number; width: number; height: number }

function part(
  id: string,
  at: { x: number; y: number },
  ports: { id: string; style?: unknown }[],
  source: Bounds[],
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    hidden: false,
    data: { ports, ...extra },
    internals: {
      positionAbsolute: at,
      handleBounds: { source, target: [] as Bounds[] },
    },
  }
}

const portBounds = (id: string, x: number, y: number): Bounds => ({
  id,
  x,
  y,
  width: 14,
  height: 14,
})

describe('portGrabTargets', () => {
  it('places each port where its handle is drawn on the flow', () => {
    const nodes = [
      part('a', { x: 100, y: 50 }, [{ id: 'a::p' }], [portBounds('a::p', -7, 30)]),
    ]

    expect(portGrabTargets(nodes)).toEqual([
      {
        portId: 'a::p',
        x: 93,
        y: 80,
        width: 14,
        height: 14,
        selected: false,
        background: undefined,
        borderColor: undefined,
      },
    ])
  })

  it('uses absolute positions for nested parts', () => {
    const nodes = [
      part('outer::inner', { x: 300, y: 200 }, [{ id: 'q' }], [portBounds('q', 10, 0)]),
    ]

    expect(portGrabTargets(nodes)[0]).toMatchObject({ x: 310, y: 200 })
  })

  it('skips handles that are not ports, and hidden parts', () => {
    const nodes = [
      part(
        'a',
        { x: 0, y: 0 },
        [{ id: 'a::p' }],
        [portBounds('rel-out-left', 0, 0), portBounds('a::p', 1, 1)],
      ),
      { ...part('b', { x: 0, y: 0 }, [{ id: 'b::p' }], [portBounds('b::p', 0, 0)]), hidden: true },
      { id: 'c', data: {}, internals: { positionAbsolute: { x: 0, y: 0 } } },
    ]

    expect(portGrabTargets(nodes).map((t) => t.portId)).toEqual(['a::p'])
  })

  it('skips ports that are not measured yet', () => {
    const nodes = [part('a', { x: 0, y: 0 }, [{ id: 'a::p' }], [])]

    expect(portGrabTargets(nodes)).toEqual([])
  })

  it('marks selected ports and keeps port colours', () => {
    const nodes = [
      part(
        'a',
        { x: 0, y: 0 },
        [{ id: 'a::p', style: { light: { backgroundColor: '#123456' } } }],
        [portBounds('a::p', 0, 0)],
        { selectedPortIds: ['a::p'], viewMode: 'light' },
      ),
    ]

    expect(portGrabTargets(nodes)[0]).toMatchObject({
      selected: true,
      background: '#123456',
    })
  })
})

describe('samePortGrabTargets', () => {
  const nodes = [part('a', { x: 0, y: 0 }, [{ id: 'a::p' }], [portBounds('a::p', 0, 0)])]

  it('is true for the same places', () => {
    expect(samePortGrabTargets(portGrabTargets(nodes), portGrabTargets(nodes))).toBe(true)
  })

  it('is false when a port moves', () => {
    const moved = [part('a', { x: 0, y: 1 }, [{ id: 'a::p' }], [portBounds('a::p', 0, 0)])]

    expect(samePortGrabTargets(portGrabTargets(nodes), portGrabTargets(moved))).toBe(false)
  })
})
