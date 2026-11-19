import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { useCaseLabel } from './useCaseLabel'

const uc = (extra: Partial<SemanticElement> = {}) =>
  ({ id: 'P::Brake', kind: 'useCase', name: 'Brake', ...extra }) as SemanticElement

describe('useCaseLabel', () => {
  it('shows the short id before the name', () => {
    expect(useCaseLabel(uc({ shortId: 'UC006' }))).toBe('UC006 Brake')
  })

  it('shows only the name without a short id', () => {
    expect(useCaseLabel(uc())).toBe('Brake')
    expect(useCaseLabel(uc({ shortId: null }))).toBe('Brake')
  })
})
