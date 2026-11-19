import { describe, expect, it } from 'vitest'
import { tinyProjectWithRequirement } from '../../testFixtures/tinyProject'
import { DEFAULT_REQUIREMENT_DISPLAY } from '../diagram/requirementDisplay'
import { elementDialogTitle } from './elementDialogTitle'

describe('elementDialogTitle', () => {
  const semantic = tinyProjectWithRequirement().semantic

  it('uses kind and name for ordinary elements', () => {
    expect(elementDialogTitle('Pkg::car', semantic)).toEqual({
      kind: 'part',
      name: 'Car',
    })
  })

  it('uses the requirement header (shortId + name) for requirements', () => {
    expect(
      elementDialogTitle('Pkg::R1', semantic, DEFAULT_REQUIREMENT_DISPLAY),
    ).toEqual({ kind: 'requirement', name: 'R-01 Safety' })
  })

  it('falls back to the name when the configured header is empty', () => {
    expect(
      elementDialogTitle('Pkg::R1', semantic, {
        ...DEFAULT_REQUIREMENT_DISPLAY,
        headerSlots: [{ kind: 'none' }, { kind: 'none' }],
      }),
    ).toEqual({ kind: 'requirement', name: 'Safety' })
  })

  it('uses shortId + name for use cases that have a short id', () => {
    const withUc: typeof semantic = {
      ...semantic,
      'Pkg::Brake': { ...semantic['Pkg::car'], id: 'Pkg::Brake', kind: 'useCase' as const, name: 'Brake', shortId: 'UC006' },
      'Pkg::Plain': { ...semantic['Pkg::car'], id: 'Pkg::Plain', kind: 'useCase' as const, name: 'Plain' },
    }
    expect(elementDialogTitle('Pkg::Brake', withUc)).toEqual({
      kind: 'useCase',
      name: 'UC006 Brake',
    })
    expect(elementDialogTitle('Pkg::Plain', withUc).name).toBe('Plain')
  })

  it('falls back to "element" and the id for unknown elements', () => {
    expect(elementDialogTitle('Nope', semantic)).toEqual({
      kind: 'element',
      name: 'Nope',
    })
  })
})
