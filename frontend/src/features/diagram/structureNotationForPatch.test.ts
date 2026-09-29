import { describe, expect, it } from 'vitest'
import type { StructureNotation } from '../../settings'
import {
  makeNotationPatchGetter,
  structureNotationForPatch,
} from './structureNotationForPatch'

describe('structureNotationForPatch', () => {
  it('defaults to sysmlv2', () => {
    expect(structureNotationForPatch(undefined)).toBe('sysmlv2')
    expect(structureNotationForPatch(null)).toBe('sysmlv2')
    expect(structureNotationForPatch('sysmlv2')).toBe('sysmlv2')
  })

  it('preserves arcadia', () => {
    expect(structureNotationForPatch('arcadia')).toBe('arcadia')
  })

  it('fresh getter returns the notation after a switch', () => {
    let notation: StructureNotation = 'sysmlv2'
    let get = makeNotationPatchGetter(notation)
    expect(get()).toBe('sysmlv2')

    notation = 'arcadia'
    // Recreate like useCallback when structureNotation is in deps
    get = makeNotationPatchGetter(notation)
    expect(get()).toBe('arcadia')
  })

  it('stale closure (settings not in deps) keeps the old notation', () => {
    const settings = {
      showDiagramDetails: { structureNotation: 'sysmlv2' as StructureNotation },
    }
    // Bug pattern: capture once, ignore later settings updates
    const closed = settings.showDiagramDetails.structureNotation
    const stale = () => structureNotationForPatch(closed)
    settings.showDiagramDetails.structureNotation = 'arcadia'
    expect(stale()).toBe('sysmlv2')
  })
})
