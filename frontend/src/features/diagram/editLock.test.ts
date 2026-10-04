import { describe, expect, it } from 'vitest'
import { isEditLocked, lockTargets } from './editLock'

const nodes = { part: { artifactId: 'part' } }
const edges = { conn: { artifactId: 'conn' } }

describe('isEditLocked', () => {
  it('is false when the flag is missing', () => {
    expect(isEditLocked(undefined)).toBe(false)
    expect(isEditLocked({})).toBe(false)
    expect(isEditLocked({ editLocked: false })).toBe(false)
  })

  it('is true only when editLocked is true', () => {
    expect(isEditLocked({ editLocked: true })).toBe(true)
  })
})

describe('lockTargets', () => {
  it('locks nodes and edges that exist in the view', () => {
    expect(lockTargets(['part', 'conn'], nodes, edges, true)).toEqual({
      nodes: { part: { artifactId: 'part', editLocked: true } },
      edges: { conn: { artifactId: 'conn', editLocked: true } },
    })
  })

  it('unlocks by sending editLocked false', () => {
    const patch = lockTargets(['part', 'conn'], nodes, edges, false)
    expect(patch.nodes.part.editLocked).toBe(false)
    expect(patch.edges.conn.editLocked).toBe(false)
  })

  it('skips ids that are not in the view', () => {
    expect(lockTargets(['missing', 'part'], nodes, edges, true)).toEqual({
      nodes: { part: { artifactId: 'part', editLocked: true } },
      edges: {},
    })
  })

  it('returns empty patches for an empty id list', () => {
    expect(lockTargets([], nodes, edges, true)).toEqual({ nodes: {}, edges: {} })
  })
})
