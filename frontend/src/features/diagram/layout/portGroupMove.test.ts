import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  applyPortGroupDelta,
  applyPortMovesToNodes,
} from './portGroupMove'

describe('applyPortGroupDelta', () => {
  const starts = [
    { id: 'a', side: 'left' as const, offset: 0.3 },
    { id: 'b', side: 'left' as const, offset: 0.5 },
    { id: 'c', side: 'left' as const, offset: 0.7 },
  ]

  it('applies the same offset delta on the same side', () => {
    const moves = applyPortGroupDelta(
      starts,
      'b',
      { side: 'left', offset: 0.6 },
      200,
      { isBoundary: true },
    )
    expect(moves).toHaveLength(3)
    expect(moves[0]).toMatchObject({ portId: 'a', side: 'left' })
    expect(moves[0]!.offset).toBeCloseTo(0.4)
    expect(moves[1]).toMatchObject({ portId: 'b', side: 'left', offset: 0.6 })
    expect(moves[2]!.offset).toBeCloseTo(0.8)
  })

  it('moves the whole group to a new side on side change', () => {
    const moves = applyPortGroupDelta(
      starts,
      'b',
      { side: 'right', offset: 0.55 },
      200,
      { isBoundary: true },
    )
    expect(moves.every((m) => m.side === 'right')).toBe(true)
    expect(moves.find((m) => m.portId === 'b')?.offset).toBe(0.55)
    expect(moves.find((m) => m.portId === 'a')?.offset).toBeCloseTo(0.35)
  })

  it('returns empty when the grabbed port is missing', () => {
    expect(
      applyPortGroupDelta(starts, 'missing', { side: 'left', offset: 0.5 }, 120),
    ).toEqual([])
  })
})

describe('applyPortMovesToNodes', () => {
  it('updates matching ports and leaves others alone', () => {
    const nodes = [
      {
        id: 'part',
        position: { x: 0, y: 0 },
        data: {
          ports: [
            { id: 'a', name: 'a', side: 'left', offset: 0.3 },
            { id: 'b', name: 'b', side: 'left', offset: 0.5 },
          ],
        },
      },
    ] as unknown as Node[]
    const next = applyPortMovesToNodes(nodes, [
      { portId: 'a', side: 'right', offset: 0.4 },
    ])
    const ports = (next[0]!.data as { ports: { id: string; side: string; offset: number }[] })
      .ports
    expect(ports[0]).toMatchObject({ id: 'a', side: 'right', offset: 0.4 })
    expect(ports[1]).toMatchObject({ id: 'b', side: 'left', offset: 0.5 })
  })
})
