import { describe, expect, it } from 'vitest'
import { VizHistory, type VizSnapshot } from './vizHistory'

function snap(
  nodeX: number,
  edgeRouting: 'direct' | 'angular' = 'direct',
): VizSnapshot {
  return {
    nodes: {
      a: {
        artifactId: 'a',
        x: nodeX,
        y: 0,
        width: 10,
        height: 10,
        symbolRef: 'default-part',
        side: null,
        offset: null,
      },
    },
    edges: {
      e: {
        artifactId: 'e',
        routing: edgeRouting,
        waypoints: [],
      },
    },
  }
}

describe('VizHistory', () => {
  it('undoes and redoes snapshots', () => {
    const h = new VizHistory()
    const s0 = snap(0)
    const s1 = snap(10)
    h.push(s0)
    const undone = h.undo(s1)
    expect(undone?.nodes.a.x).toBe(0)
    const redone = h.redo(undone!)
    expect(redone?.nodes.a.x).toBe(10)
  })

  it('clears redo after a new push', () => {
    const h = new VizHistory()
    h.push(snap(0))
    h.undo(snap(1))
    expect(h.canRedo()).toBe(true)
    h.push(snap(2))
    expect(h.canRedo()).toBe(false)
  })

  it('caps depth at maxDepth', () => {
    const h = new VizHistory(2)
    h.push(snap(0))
    h.push(snap(1))
    h.push(snap(2))
    // Only last two remain: 1 then 2 on stack bottom→top; undo yields 2 then 1
    const u1 = h.undo(snap(3))
    expect(u1?.nodes.a.x).toBe(2)
    const u2 = h.undo(u1!)
    expect(u2?.nodes.a.x).toBe(1)
    expect(h.undo(u2!)).toBeNull()
  })

  it('clear empties both stacks', () => {
    const h = new VizHistory()
    h.push(snap(0))
    h.undo(snap(1))
    h.clear()
    expect(h.canUndo()).toBe(false)
    expect(h.canRedo()).toBe(false)
  })
})
