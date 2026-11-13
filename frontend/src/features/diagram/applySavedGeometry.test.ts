import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { applySavedGeometry } from './applySavedGeometry'

const part = (id: string, extra: Partial<Node> = {}): Node =>
  ({
    id,
    type: 'part',
    position: { x: 10, y: 20 },
    width: 200,
    height: 120,
    style: { width: 200, height: 120 },
    data: { label: id, ports: [] },
    ...extra,
  }) as Node

describe('applySavedGeometry', () => {
  it('sizes a node from the Details panel at once', () => {
    const [a] = applySavedGeometry([part('A')], {
      A: { artifactId: 'A', width: 400, height: 220 },
    })
    expect(a!.style).toMatchObject({ width: 400, height: 220 })
    expect(a!.width).toBe(400)
    expect(a!.height).toBe(220)
    expect(a!.position).toEqual({ x: 10, y: 20 })
  })

  it('moves a node from the Details panel at once', () => {
    const [a] = applySavedGeometry([part('A')], { A: { artifactId: 'A', x: 300, y: 40 } })
    expect(a!.position).toEqual({ x: 300, y: 40 })
    expect(a!.style).toMatchObject({ width: 200, height: 120 })
  })

  it('moves the ports a resize puts at a new offset', () => {
    const owner = part('A', {
      data: {
        label: 'A',
        ports: [
          { id: 'A::p', name: 'p', side: 'left', offset: 0.9 },
          { id: 'A::q', name: 'q', side: 'right', offset: 0.5 },
        ],
      },
    })
    const [a] = applySavedGeometry([owner], {
      A: { artifactId: 'A', height: 80 },
      'A::p': { artifactId: 'A::p', side: 'left', offset: 0.7 },
    })
    const ports = (a!.data as { ports: { id: string; offset: number }[] }).ports
    expect(ports.find((p) => p.id === 'A::p')!.offset).toBe(0.7)
    expect(ports.find((p) => p.id === 'A::q')!.offset).toBe(0.5)
  })

  it('leaves other nodes untouched', () => {
    const b = part('B')
    const out = applySavedGeometry([part('A'), b], { A: { artifactId: 'A', x: 1, y: 2 } })
    expect(out[1]).toBe(b)
  })
})
