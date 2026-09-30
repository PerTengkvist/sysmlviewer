import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyFolderTreeOrder,
  buildFolderTree,
  defaultChildOrder,
  folderContentsGroupKey,
  folderSiblingGroupKey,
  loadViewTreeOrder,
  orderSiblingIds,
  packageGroupKey,
  reorderWithin,
  saveViewTreeOrder,
} from './viewTreeOrder'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      clear: () => store.clear(),
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
  })
})

describe('buildFolderTree', () => {
  it('nests directories and keeps each element in its own folder', () => {
    const tree = buildFolderTree([
      { id: 'pkg-b', fileId: 'a/b/model.sysml' },
      { id: 'pkg-a', fileId: 'a/top.sysml' },
      { id: 'pkg-c', fileId: 'a/c/model.sysml' },
      { id: 'loose', fileId: 'root.sysml' },
    ])
    expect(tree.ungroupedIds).toEqual(['loose'])
    expect(tree.folders.map((folder) => folder.path)).toEqual(['a'])
    const folderA = tree.folders[0]
    expect(folderA.elementIds).toEqual(['pkg-a'])
    expect(folderA.folders.map((folder) => folder.name)).toEqual(['b', 'c'])
    expect(folderA.folders[0].elementIds).toEqual(['pkg-b'])
    expect(folderA.folders[1].elementIds).toEqual(['pkg-c'])
  })
})

describe('orderSiblingIds', () => {
  it('keeps a saved order and appends ids that are new', () => {
    expect(orderSiblingIds(['a', 'b', 'c', 'd'], ['c', 'a', 'missing'])).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })
})

describe('applyFolderTreeOrder', () => {
  it('reorders folders at the root and inside a parent folder', () => {
    const tree = buildFolderTree([
      { id: 'dyn', fileId: 'dynamics/sequences.sysml' },
      { id: 'fun', fileId: 'functions/functions.sysml' },
      { id: 'nested-b', fileId: 'logical/b/car.sysml' },
      { id: 'nested-a', fileId: 'logical/a/car.sysml' },
    ])
    const ordered = applyFolderTreeOrder(tree.folders, {
      [folderSiblingGroupKey('')]: ['functions', 'dynamics', 'logical'],
      [folderSiblingGroupKey('logical')]: ['logical/b', 'logical/a'],
    })
    expect(ordered.map((folder) => folder.name)).toEqual(['functions', 'dynamics', 'logical'])
    const logical = ordered[2]
    expect(logical.folders.map((folder) => folder.name)).toEqual(['b', 'a'])
  })

  it('reorders elements inside one folder without pulling in another folder', () => {
    const tree = buildFolderTree([
      { id: 'second', fileId: 'logical/b.sysml' },
      { id: 'first', fileId: 'logical/a.sysml' },
      { id: 'other', fileId: 'physical/c.sysml' },
    ])
    const ordered = applyFolderTreeOrder(tree.folders, {
      [folderContentsGroupKey('logical')]: ['second', 'first'],
    })
    const logical = ordered.find((folder) => folder.path === 'logical')
    const physical = ordered.find((folder) => folder.path === 'physical')
    expect(logical?.elementIds).toEqual(['second', 'first'])
    expect(physical?.elementIds).toEqual(['other'])
  })
})

describe('reorderWithin', () => {
  it('moves an id before or after a sibling', () => {
    expect(reorderWithin(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(reorderWithin(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
  })

  it('refuses a drop when the target is not in the same list', () => {
    expect(reorderWithin(['pkg-a', 'part-a'], 'part-a', 'pkg-b', 'before')).toBeNull()
    expect(reorderWithin(['functions', 'dynamics'], 'functions', 'functions', 'after')).toBeNull()
  })
})

describe('defaultChildOrder', () => {
  it('lists views before other children of a package', () => {
    const byId = {
      part: { kind: 'part' },
      view: { kind: 'view' },
      edge: { kind: 'dependency' },
    }
    expect(defaultChildOrder(['part', 'edge', 'view'], byId)).toEqual(['view', 'part'])
  })
})

describe('view tree order storage', () => {
  it('round-trips group order for one project', () => {
    const order = {
      groups: {
        [folderSiblingGroupKey('')]: ['use_cases', 'functions'],
        [packageGroupKey('pkg1')]: ['view1', 'part1'],
      },
    }
    saveViewTreeOrder('project-1', order)
    expect(loadViewTreeOrder('project-1')).toEqual(order)
    expect(loadViewTreeOrder('project-2')).toEqual({ groups: {} })
  })
})
