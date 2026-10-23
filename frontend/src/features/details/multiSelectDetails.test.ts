import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  mergeStylePatch,
  multiPartSelection,
  sharedNumericField,
} from './multiSelectDetails'

const part = (id: string): SemanticElement =>
  ({
    id,
    kind: 'part',
    name: id,
    children: [],
  }) as SemanticElement

const port = (id: string): SemanticElement =>
  ({
    id,
    kind: 'port',
    name: id,
    children: [],
  }) as SemanticElement

describe('multiPartSelection', () => {
  const semantic = {
    a: part('a'),
    b: part('b'),
    c: part('c'),
    p: port('p'),
  }

  it('returns null for fewer than two parts', () => {
    expect(multiPartSelection([], semantic)).toBeNull()
    expect(multiPartSelection(['a'], semantic)).toBeNull()
    expect(multiPartSelection(['a', 'p'], semantic)).toBeNull()
  })

  it('returns the part ids when at least two parts are selected', () => {
    expect(multiPartSelection(['a', 'b'], semantic)).toEqual(['a', 'b'])
    expect(multiPartSelection(['a', 'p', 'b'], semantic)).toEqual(['a', 'b'])
  })
})

describe('mergeStylePatch', () => {
  it('merges into the given mode without dropping the other', () => {
    const next = mergeStylePatch(
      { light: { lineColor: '#111' }, dark: { lineColor: '#eee' } },
      'light',
      { lineThickness: 3 },
    )
    expect(next.light).toEqual({ lineColor: '#111', lineThickness: 3 })
    expect(next.dark).toEqual({ lineColor: '#eee' })
  })

  it('creates the mode when missing', () => {
    expect(mergeStylePatch(undefined, 'dark', { lineColor: '#fff' })).toEqual({
      dark: { lineColor: '#fff' },
    })
  })
})

describe('sharedNumericField', () => {
  it('returns the shared rounded value or null when mixed', () => {
    const nodes = {
      a: { artifactId: 'a', x: 0, y: 0, width: 180, height: 100, symbolRef: 'p' },
      b: { artifactId: 'b', x: 0, y: 0, width: 180, height: 120, symbolRef: 'p' },
    }
    expect(sharedNumericField(['a', 'b'], nodes, 'width')).toBe(180)
    expect(sharedNumericField(['a', 'b'], nodes, 'height')).toBeNull()
  })
})
