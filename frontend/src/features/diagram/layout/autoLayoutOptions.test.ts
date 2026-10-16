import { describe, expect, it } from 'vitest'
import {
  clampLayoutWeights,
  clampLevelWeights,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  inferPortFlowRole,
  spacingToDesiredEdgeLength,
  SUGGESTED_LEVEL_WEIGHTS,
} from './autoLayoutOptions'

describe('custom weight presets', () => {
  it('defaults customWeights to suggested level presets', () => {
    expect(DEFAULT_AUTO_LAYOUT_DIRECTIVES.customWeights).toEqual(
      SUGGESTED_LEVEL_WEIGHTS,
    )
  })

  it('clamps weights to 0..1 and fills missing keys', () => {
    const w = clampLayoutWeights(
      { connectionAwareness: 1.5, flowDirection: -0.2 },
      SUGGESTED_LEVEL_WEIGHTS.leaf,
    )
    expect(w.connectionAwareness).toBe(1)
    expect(w.flowDirection).toBe(0)
    expect(w.portClarity).toBe(SUGGESTED_LEVEL_WEIGHTS.leaf.portClarity)
  })

  it('clampLevelWeights restores suggested levels when omitted', () => {
    expect(clampLevelWeights(undefined)).toEqual(SUGGESTED_LEVEL_WEIGHTS)
  })
})

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
