import { describe, expect, it } from 'vitest'
import { bulkOp } from './bulkOps'

const nodes = {
  part: { artifactId: 'part', editLocked: false },
}
const edges = {
  conn: {
    artifactId: 'conn',
    routing: 'angular' as const,
    waypoints: [{ x: 1, y: 2, locked: true }],
    editLocked: true,
  },
  dep: {
    artifactId: 'dep',
    routing: 'spline' as const,
    waypoints: [{ x: 3, y: 4 }],
  },
}

describe('bulkOp', () => {
  it('locks selected parts and connections', () => {
    const patch = bulkOp('lock', ['part', 'conn'], nodes, edges)
    expect(patch.nodes.part).toEqual({ artifactId: 'part', editLocked: true })
    expect(patch.edges.conn).toEqual({ artifactId: 'conn', editLocked: true })
  })

  it('unlocks selected parts and connections', () => {
    const patch = bulkOp('unlock', ['part', 'conn'], nodes, edges)
    expect(patch.nodes.part).toEqual({ artifactId: 'part', editLocked: false })
    expect(patch.edges.conn).toEqual({ artifactId: 'conn', editLocked: false })
  })

  it('sets direct routing only on selected edges', () => {
    const patch = bulkOp('direct', ['part', 'conn', 'dep'], nodes, edges)
    expect(patch.nodes).toEqual({})
    expect(patch.edges).toEqual({
      conn: { artifactId: 'conn', routing: 'direct' },
      dep: { artifactId: 'dep', routing: 'direct' },
    })
    expect(patch.edges.conn).not.toHaveProperty('waypoints')
    expect(patch.edges.conn).not.toHaveProperty('editLocked')
  })

  it('sets angular routing only on selected edges', () => {
    const patch = bulkOp('angular', ['part', 'conn', 'dep'], nodes, edges)
    expect(patch.nodes).toEqual({})
    expect(patch.edges.conn).toEqual({ artifactId: 'conn', routing: 'angular' })
    expect(patch.edges.dep).toEqual({ artifactId: 'dep', routing: 'angular' })
  })

  it('returns an empty patch when direct is applied to parts only', () => {
    expect(bulkOp('direct', ['part'], nodes, edges)).toEqual({
      nodes: {},
      edges: {},
    })
  })

  it('returns an empty patch for an empty selection', () => {
    for (const command of ['lock', 'unlock', 'direct', 'angular'] as const) {
      expect(bulkOp(command, [], nodes, edges)).toEqual({ nodes: {}, edges: {} })
    }
  })
})
