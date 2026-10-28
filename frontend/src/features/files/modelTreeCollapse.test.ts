import { describe, expect, it } from 'vitest'
import { collapsedFolderKeysForAll, collapsedIdsForAll } from './modelTreeCollapse'

const byId = {
  A: { id: 'A', kind: 'package', children: ['A::b', 'A::c'] },
  'A::b': { id: 'A::b', kind: 'part', children: ['A::b::d'] },
  'A::b::d': { id: 'A::b::d', kind: 'part', children: [] },
  'A::c': { id: 'A::c', kind: 'part', children: [] },
}

describe('modelTreeCollapse', () => {
  it('collapses every element that has children and no leaves', () => {
    const ids = collapsedIdsForAll(byId, [byId.A])
    expect([...ids].sort()).toEqual(['A', 'A::b'])
  })

  it('collapses every folder recursively', () => {
    const keys = collapsedFolderKeysForAll([
      { name: 'a', path: 'a', elementIds: [], folders: [{ name: 'b', path: 'a/b', elementIds: [], folders: [] }] },
      { name: 'c', path: 'c', elementIds: [], folders: [] },
    ])
    expect([...keys].sort()).toEqual(['folder::a', 'folder::a/b', 'folder::c'])
  })
})
