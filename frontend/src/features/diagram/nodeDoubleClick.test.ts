import { describe, expect, it } from 'vitest'
import { nodeDoubleClickAction } from './nodeDoubleClick'

describe('nodeDoubleClickAction', () => {
  it('opens the element dialog for parts, interfaces and packages', () => {
    expect(nodeDoubleClickAction('part')).toBe('element-dialog')
    expect(nodeDoubleClickAction('interface')).toBe('element-dialog')
    expect(nodeDoubleClickAction('package')).toBe('element-dialog')
  })

  it('keeps the use-case flow dialog', () => {
    expect(nodeDoubleClickAction('useCase')).toBe('use-case-flow')
  })

  it('does nothing for other kinds', () => {
    expect(nodeDoubleClickAction('port')).toBeNull()
    expect(nodeDoubleClickAction('attribute')).toBeNull()
    expect(nodeDoubleClickAction('requirement')).toBeNull()
    expect(nodeDoubleClickAction(undefined)).toBeNull()
  })
})
