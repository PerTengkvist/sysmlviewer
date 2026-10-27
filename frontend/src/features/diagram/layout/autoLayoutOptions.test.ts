import { describe, expect, it } from 'vitest'
import {
  allowedPortSides,
  clampLayoutWeights,
  clampLevelWeights,
  clampPortSideToMode,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  inferPortFlowRole,
  isPortPlacementMode,
  PORT_PLACEMENT_MODES,
  portPlacementLabel,
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

describe('port placement modes', () => {
  it('lists the four modes with labels', () => {
    expect(PORT_PLACEMENT_MODES).toEqual([
      'inputsLeftOutputsRight',
      'optimized',
      'optimizedNoTop',
      'optimizedNoTopBottom',
    ])
    expect(portPlacementLabel('optimizedNoTop')).toBe(
      'Optimized placement – no top',
    )
    expect(portPlacementLabel('optimizedNoTopBottom')).toBe(
      'Optimized placement – no top/bottom',
    )
  })

  it('inputs left / outputs right: role decides, unknown may use either', () => {
    expect(allowedPortSides('inputsLeftOutputsRight', 'in')).toEqual(['left'])
    expect(allowedPortSides('inputsLeftOutputsRight', 'out')).toEqual(['right'])
    expect(allowedPortSides('inputsLeftOutputsRight', 'unknown')).toEqual([
      'left',
      'right',
    ])
  })

  it('optimized variants restrict sides regardless of role', () => {
    for (const role of ['in', 'out', 'unknown'] as const) {
      expect(allowedPortSides('optimized', role)).toEqual([
        'left',
        'right',
        'top',
        'bottom',
      ])
      expect(allowedPortSides('optimizedNoTop', role)).toEqual([
        'left',
        'right',
        'bottom',
      ])
      expect(allowedPortSides('optimizedNoTopBottom', role)).toEqual([
        'left',
        'right',
      ])
    }
  })

  it('clampPortSideToMode keeps allowed sides and maps others', () => {
    expect(clampPortSideToMode('optimizedNoTop', 'unknown', 'bottom')).toBe('bottom')
    // A forbidden side most likely faced the peer: prefer a perpendicular side.
    expect(clampPortSideToMode('optimizedNoTop', 'unknown', 'top')).toBe('left')
    expect(clampPortSideToMode('optimizedNoTopBottom', 'unknown', 'top')).toBe('left')
    expect(clampPortSideToMode('optimizedNoTop', 'unknown', 'top', { x: 0, y: 30 })).toBe(
      'bottom',
    )
    expect(
      clampPortSideToMode('optimizedNoTopBottom', 'unknown', 'top', { x: 5, y: -20 }),
    ).toBe('right')
    expect(clampPortSideToMode('inputsLeftOutputsRight', 'in', 'right')).toBe('left')
    expect(clampPortSideToMode('inputsLeftOutputsRight', 'out', 'top')).toBe('right')
  })

  it('isPortPlacementMode validates raw strings', () => {
    expect(isPortPlacementMode('optimizedNoTop')).toBe(true)
    expect(isPortPlacementMode('nope')).toBe(false)
  })
})
