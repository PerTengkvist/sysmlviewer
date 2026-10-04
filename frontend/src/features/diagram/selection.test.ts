import { describe, expect, it } from 'vitest'
import {
  nextSelection,
  selectionAnchor,
  selectionFromFlow,
} from './selection'

describe('nextSelection', () => {
  it('click without shift selects only that id', () => {
    const r = nextSelection(['a'], 'b', { shift: false })
    expect(r.selectedIds).toEqual(['b'])
    expect(r.primaryId).toBe('b')
  })

  it('shift-click adds while keeping first as anchor', () => {
    const r = nextSelection(['a'], 'b', { shift: true })
    expect(r.selectedIds).toEqual(['a', 'b'])
    expect(selectionAnchor(r.selectedIds)).toBe('a')
    expect(r.primaryId).toBe('b')
  })

  it('shift-click on selected removes it; next becomes anchor if first removed', () => {
    const r = nextSelection(['a', 'b'], 'a', { shift: true })
    expect(r.selectedIds).toEqual(['b'])
    expect(selectionAnchor(r.selectedIds)).toBe('b')
  })

  it('null clickedId clears selection', () => {
    const r = nextSelection(['a', 'b'], null, { shift: false })
    expect(r.selectedIds).toEqual([])
    expect(r.primaryId).toBeNull()
  })
})

describe('selectionFromFlow', () => {
  it('sets anchor to first id in node list order', () => {
    const r = selectionFromFlow(['n2', 'n1', 'n3'])
    expect(r.selectedIds).toEqual(['n2', 'n1', 'n3'])
    expect(selectionAnchor(r.selectedIds)).toBe('n2')
    expect(r.primaryId).toBe('n2')
  })

  it('empty list clears', () => {
    expect(selectionFromFlow([])).toEqual({
      selectedIds: [],
      primaryId: null,
    })
  })
})
