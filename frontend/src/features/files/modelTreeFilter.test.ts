import { beforeEach, describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  loadModelTreeKindFilter,
  saveModelTreeKindFilter,
  treeKindsInSemantic,
} from './modelTreeFilter'

function el(
  id: string,
  kind: SemanticElement['kind'],
): SemanticElement {
  return {
    id,
    kind,
    name: id,
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: null,
  }
}

describe('treeKindsInSemantic', () => {
  it('lists non-relation kinds only', () => {
    const semantic = {
      a: el('a', 'part'),
      b: el('b', 'view'),
      c: el('c', 'connection'),
      d: el('d', 'package'),
    }
    expect(treeKindsInSemantic(semantic)).toEqual(['package', 'part', 'view'])
  })
})

const store = new Map<string, string>()

describe('load/saveModelTreeKindFilter', () => {
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

  it('defaults to all available kinds', () => {
    const kinds = ['part', 'view'] as const
    expect([...loadModelTreeKindFilter('p1', [...kinds])].sort()).toEqual([
      'part',
      'view',
    ])
  })

  it('round-trips enabled kinds and adds newly appeared kinds', () => {
    saveModelTreeKindFilter('p1', ['part'])
    const loaded = loadModelTreeKindFilter('p1', ['part', 'view', 'package'])
    expect(loaded.has('part')).toBe(true)
    expect(loaded.has('view')).toBe(true)
    expect(loaded.has('package')).toBe(true)
  })
})
