import { describe, expect, it } from 'vitest'

import {
  applyPortLabelMoveToNodes,
  dragPortLabelOffset,
  isMovedPortLabel,
  leaderLineEnd,
  PORT_LABEL_SNAP_PX,
  syncPortLabelOffsets,
} from './portLabelOffset'

describe('isMovedPortLabel', () => {
  it('treats missing and zero offsets as the default place', () => {
    expect(isMovedPortLabel(undefined)).toBe(false)
    expect(isMovedPortLabel(null)).toBe(false)
    expect(isMovedPortLabel({ x: 0, y: 0 })).toBe(false)
  })

  it('treats any other offset as moved', () => {
    expect(isMovedPortLabel({ x: 0, y: -3 })).toBe(true)
  })
})

describe('dragPortLabelOffset', () => {
  it('adds the pointer movement to where the label started', () => {
    expect(dragPortLabelOffset({ x: 10, y: 5 }, { x: 30, y: -20 }, 1)).toEqual({
      x: 40,
      y: -15,
    })
  })

  it('converts screen pixels to diagram pixels', () => {
    expect(dragPortLabelOffset(null, { x: 60, y: 40 }, 2)).toEqual({ x: 30, y: 20 })
  })

  it('stores whole pixels', () => {
    expect(dragPortLabelOffset(null, { x: 33.4, y: 20.6 }, 1)).toEqual({ x: 33, y: 21 })
  })

  it('snaps back to the default place when dropped close to it', () => {
    const justInside = PORT_LABEL_SNAP_PX - 1

    expect(dragPortLabelOffset(null, { x: justInside, y: 0 }, 1)).toBeNull()
    expect(dragPortLabelOffset({ x: 50, y: 0 }, { x: -50, y: 2 }, 1)).toBeNull()
  })

  it('does not snap just outside the distance', () => {
    expect(dragPortLabelOffset(null, { x: PORT_LABEL_SNAP_PX, y: 0 }, 1)).toEqual({
      x: PORT_LABEL_SNAP_PX,
      y: 0,
    })
  })
})

describe('leaderLineEnd', () => {
  const box = { left: 100, top: 50, right: 160, bottom: 62 }

  it('stops at the near edge of the label', () => {
    expect(leaderLineEnd({ x: 20, y: 56 }, box)).toEqual({ x: 100, y: 56 })
    expect(leaderLineEnd({ x: 130, y: 200 }, box)).toEqual({ x: 130, y: 62 })
  })

  it('stops at the corner when the port is diagonal to the label', () => {
    expect(leaderLineEnd({ x: 200, y: 0 }, box)).toEqual({ x: 160, y: 50 })
  })

  it('draws nothing when the port is under the label', () => {
    expect(leaderLineEnd({ x: 130, y: 56 }, box)).toBeNull()
  })
})

describe('applyPortLabelMoveToNodes', () => {
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, data: { ports: [{ id: 'p' }, { id: 'q' }] } },
    { id: 'b', position: { x: 0, y: 0 }, data: { ports: [{ id: 'r' }] } },
  ]

  it('stores the offset on the port and leaves other nodes alone', () => {
    const next = applyPortLabelMoveToNodes(nodes, 'q', { x: 4, y: 5 })

    expect(next[0]!.data.ports).toEqual([
      { id: 'p' },
      { id: 'q', labelOffset: { x: 4, y: 5 } },
    ])
    expect(next[1]).toBe(nodes[1])
  })

  it('clears the offset with null', () => {
    const moved = applyPortLabelMoveToNodes(nodes, 'p', { x: 1, y: 1 })

    const next = applyPortLabelMoveToNodes(moved, 'p', null)

    expect(next[0]!.data.ports[0]).toEqual({ id: 'p', labelOffset: null })
  })
})

describe('syncPortLabelOffsets', () => {
  const nodes = [
    {
      id: 'a',
      position: { x: 0, y: 0 },
      data: { ports: [{ id: 'p', labelOffset: { x: 4, y: 5 } as const }, { id: 'q' }] },
    },
    { id: 'b', position: { x: 0, y: 0 }, data: {} },
  ]

  it('takes saved offsets and clears the ones no longer saved', () => {
    const next = syncPortLabelOffsets(nodes, { q: { labelOffset: { x: 9, y: 9 } } })

    expect(next[0]!.data.ports).toEqual([
      { id: 'p', labelOffset: null },
      { id: 'q', labelOffset: { x: 9, y: 9 } },
    ])
  })

  it('keeps nodes that already show what is saved', () => {
    const next = syncPortLabelOffsets(nodes, { p: { labelOffset: { x: 4, y: 5 } } })

    expect(next[0]).toBe(nodes[0])
    expect(next[1]).toBe(nodes[1])
  })
})
