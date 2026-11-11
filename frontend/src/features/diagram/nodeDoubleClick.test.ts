import { describe, expect, it } from 'vitest'
import {
  diagramDoubleClickAction,
  nodeDoubleClickAction,
  relatedDetailsAction,
} from './nodeDoubleClick'

describe('nodeDoubleClickAction', () => {
  it('opens the element dialog for parts, interfaces, packages and views', () => {
    expect(nodeDoubleClickAction('part')).toBe('element-dialog')
    expect(nodeDoubleClickAction('interface')).toBe('element-dialog')
    expect(nodeDoubleClickAction('package')).toBe('element-dialog')
    expect(nodeDoubleClickAction('view')).toBe('element-dialog')
  })

  it('opens the element dialog for requirements', () => {
    expect(nodeDoubleClickAction('requirement')).toBe('element-dialog')
  })

  it('keeps the use-case flow dialog', () => {
    expect(nodeDoubleClickAction('useCase')).toBe('use-case-flow')
  })

  it('does nothing for other kinds', () => {
    expect(nodeDoubleClickAction('port')).toBeNull()
    expect(nodeDoubleClickAction('attribute')).toBeNull()
    expect(nodeDoubleClickAction(undefined)).toBeNull()
  })
})

describe('diagramDoubleClickAction', () => {
  it('opens the element dialog for connection and binding edges', () => {
    expect(diagramDoubleClickAction('connection')).toBe('element-dialog')
    expect(diagramDoubleClickAction('binding')).toBe('element-dialog')
  })

  it('opens the element dialog for interface usages', () => {
    expect(diagramDoubleClickAction('interface')).toBe('element-dialog')
  })
})

describe('relatedDetailsAction', () => {
  it('opens use cases in the use case dialog and everything else in the element dialog', () => {
    expect(relatedDetailsAction('useCase')).toBe('use-case-flow')
    expect(relatedDetailsAction('requirement')).toBe('element-dialog')
    expect(relatedDetailsAction('actor')).toBe('element-dialog')
    expect(relatedDetailsAction('dependency')).toBe('element-dialog')
    expect(relatedDetailsAction(undefined)).toBe('element-dialog')
  })
})
