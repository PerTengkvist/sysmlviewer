import { describe, expect, it } from 'vitest'
import {
  inferPortFlowRole,
  spacingToDesiredEdgeLength,
} from './autoLayoutOptions'

describe('inferPortFlowRole', () => {
  it('uses In/Out name suffixes', () => {
    expect(inferPortFlowRole({ id: 'p1', name: 'energyIn' }, [])).toBe('in')
    expect(inferPortFlowRole({ id: 'p2', name: 'directionOut' }, [])).toBe('out')
    expect(inferPortFlowRole({ id: 'p3', name: 'chargeIn' }, [])).toBe('in')
  })

  it('falls back to connection source/target counts', () => {
    const links = [
      { sourcePort: 'a', targetPort: 'b' },
      { sourcePort: 'c', targetPort: 'b' },
    ]
    expect(inferPortFlowRole({ id: 'b', name: 'bus' }, links)).toBe('in')
    expect(inferPortFlowRole({ id: 'a', name: 'bus' }, links)).toBe('out')
  })
})

describe('spacingToDesiredEdgeLength', () => {
  it('maps presets to increasing lengths', () => {
    expect(spacingToDesiredEdgeLength('compact')).toBeLessThan(
      spacingToDesiredEdgeLength('normal'),
    )
    expect(spacingToDesiredEdgeLength('normal')).toBeLessThan(
      spacingToDesiredEdgeLength('spacious'),
    )
  })
})
