import { describe, expect, it } from 'vitest'
import type { LayeredLayoutConfig, LayoutRuleRow } from '../../../api'
import type { LayoutArtefact } from '../layoutWizard'
import { buildLayoutConstraints } from './layoutConstraints'

function art(id: string, kind = 'part'): LayoutArtefact {
  return { id, name: id, kind, x: 0, y: 0, width: 100, height: 60 }
}

function rule(partial: Partial<LayoutRuleRow> & { id: string }): LayoutRuleRow {
  return {
    kind: 'part',
    namePattern: '*',
    placement: 'below',
    peerKind: 'part',
    peerNamePattern: '*',
    ...partial,
  }
}

function belong(id: string, name: string, layer: string): LayoutRuleRow {
  return rule({
    id,
    namePattern: name,
    placement: 'belong to',
    peerKind: 'layer',
    peerNamePattern: layer,
  })
}

const layered: LayeredLayoutConfig = {
  enabled: true,
  scopes: [
    {
      id: 'root',
      scopePattern: '*',
      direction: 'top-down',
      layers: [
        { id: 'l1', name: 'Input' },
        { id: 'l2', name: 'Control' },
        { id: 'l3', name: '3' },
      ],
    },
  ],
}

/** Same config with another root direction. */
function withDirection(
  config: LayeredLayoutConfig,
  direction: LayeredLayoutConfig['scopes'][number]['direction'],
): LayeredLayoutConfig {
  return { ...config, scopes: config.scopes.map((s) => ({ ...s, direction })) }
}

describe('buildLayoutConstraints — layers', () => {
  it('assigns explicit belong-to layers by name or ordinal', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'A', 'Input'), belong('r2', 'B', '3')],
      layered,
      [art('A'), art('B')],
      [],
    )
    expect(c.enabled).toBe(true)
    expect(c.direction).toBe('top-down')
    expect(c.layerCount).toBe(3)
    expect(c.layerNames).toEqual(['Input', 'Control', '3'])
    expect(c.layerOf.get('A')).toBe(0)
    expect(c.layerOf.get('B')).toBe(2)
    expect([...c.explicit].sort()).toEqual(['A', 'B'])
    expect(c.autoAssigned).toEqual([])
  })

  it('reports unknown layer names', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'A', 'Nope')],
      layered,
      [art('A')],
      [],
    )
    expect(c.unknownLayerRuleIds).toEqual(['r1'])
    // Not explicit; falls back to auto-assignment (last layer).
    expect(c.explicit.has('A')).toBe(false)
    expect(c.layerOf.get('A')).toBe(2)
  })

  it('auto-assigns unassigned parts after their sources and before their targets', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'A', 'Input'), belong('r2', 'C', '3')],
      layered,
      [art('A'), art('B'), art('C'), art('D')],
      [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        // D has no links → last layer
      ],
    )
    expect(c.layerOf.get('B')).toBe(1)
    expect(c.layerOf.get('D')).toBe(2)
    expect(c.autoAssigned).toEqual(['B', 'D'])
  })

  it('an in-layer order rule pulls the unassigned peer into the same layer', () => {
    const c = buildLayoutConstraints(
      [
        belong('r1', 'A', 'Control'),
        rule({
          id: 'r2',
          namePattern: 'A',
          placement: 'to the left of',
          peerNamePattern: 'B',
        }),
      ],
      layered,
      [art('A'), art('B'), art('Z')],
      [{ source: 'B', target: 'Z' }],
    )
    expect(c.layerOf.get('B')).toBe(1)
    expect(c.orderInLayer).toEqual([{ before: 'A', after: 'B', ruleId: 'r2' }])
  })

  it('precedence along the direction nudges auto-assigned parts', () => {
    const c = buildLayoutConstraints(
      [
        belong('r1', 'A', 'Control'),
        rule({ id: 'r2', namePattern: 'B', placement: 'below', peerNamePattern: 'A' }),
      ],
      layered,
      [art('A'), art('B')],
      [],
    )
    expect(c.precedence).toEqual([{ before: 'A', after: 'B', ruleId: 'r2' }])
    expect(c.layerOf.get('B')).toBeGreaterThanOrEqual(1)
  })
})

describe('buildLayoutConstraints — direction mapping', () => {
  const arts = [art('A'), art('B')]

  it('top-down: vertical rules are precedence, horizontal rules are in-layer order', () => {
    const c = buildLayoutConstraints(
      [
        rule({ id: 'v', namePattern: 'A', placement: 'above', peerNamePattern: 'B' }),
        rule({ id: 'h', namePattern: 'B', placement: 'to the right of', peerNamePattern: 'A' }),
      ],
      withDirection(layered, 'top-down'),
      arts,
      [],
    )
    expect(c.precedence).toEqual([{ before: 'A', after: 'B', ruleId: 'v' }])
    expect(c.orderInLayer).toEqual([{ before: 'A', after: 'B', ruleId: 'h' }])
  })

  it('bottom-up reverses vertical precedence', () => {
    const c = buildLayoutConstraints(
      [rule({ id: 'v', namePattern: 'A', placement: 'above', peerNamePattern: 'B' })],
      withDirection(layered, 'bottom-up'),
      arts,
      [],
    )
    expect(c.precedence).toEqual([{ before: 'B', after: 'A', ruleId: 'v' }])
  })

  it('left-right: horizontal rules are precedence, vertical rules are in-layer order', () => {
    const c = buildLayoutConstraints(
      [
        rule({ id: 'h', namePattern: 'A', placement: 'to the left of', peerNamePattern: 'B' }),
        rule({ id: 'v', namePattern: 'A', placement: 'above', peerNamePattern: 'B' }),
      ],
      withDirection(layered, 'left-right'),
      arts,
      [],
    )
    expect(c.precedence).toEqual([{ before: 'A', after: 'B', ruleId: 'h' }])
    expect(c.orderInLayer).toEqual([{ before: 'A', after: 'B', ruleId: 'v' }])
  })

  it('absolute rules expand against every other artefact', () => {
    const c = buildLayoutConstraints(
      [rule({ id: 't', namePattern: 'A', placement: 'top', peerKind: null, peerNamePattern: null })],
      withDirection(layered, 'top-down'),
      [art('A'), art('B'), art('C')],
      [],
    )
    expect(c.precedence.map((p) => `${p.before}>${p.after}`).sort()).toEqual([
      'A>B',
      'A>C',
    ])
  })

  it('works without layered config (direction from options)', () => {
    const c = buildLayoutConstraints(
      [rule({ id: 'h', namePattern: 'A', placement: 'to the left of', peerNamePattern: 'B' })],
      null,
      arts,
      [],
      { direction: 'left-right' },
    )
    expect(c.enabled).toBe(false)
    expect(c.layerCount).toBe(0)
    expect(c.layerOf.size).toBe(0)
    expect(c.precedence).toEqual([{ before: 'A', after: 'B', ruleId: 'h' }])
  })

  it('ignores belong-to rules when layered layout is disabled', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'A', 'Input')],
      { ...layered, enabled: false },
      arts,
      [],
    )
    expect(c.enabled).toBe(false)
    expect(c.layerOf.size).toBe(0)
    expect(c.unknownLayerRuleIds).toEqual([])
  })
})

describe('buildLayoutConstraints — scopes', () => {
  const nested = (id: string, parentId: string | null): LayoutArtefact => ({
    ...art(id),
    parentId,
  })
  const config: LayeredLayoutConfig = {
    enabled: true,
    scopes: [
      {
        id: 'root',
        scopePattern: '*',
        direction: 'top-down',
        layers: [{ id: 'l1', name: 'Top' }, { id: 'l2', name: 'Bottom' }],
      },
      {
        id: 'ecu',
        scopePattern: '*Ecu',
        direction: 'left-right',
        layers: [{ id: 'l1', name: 'UI' }, { id: 'l2', name: 'Core' }],
      },
    ],
  }
  // Whitebox: car ⊃ { x, infoEcu ⊃ {sw, hw}, engineEcu ⊃ {ctrl} }
  const arts = [
    nested('car', null),
    nested('x', 'car'),
    nested('infoEcu', 'car'),
    nested('sw', 'infoEcu'),
    nested('hw', 'infoEcu'),
    nested('engineEcu', 'car'),
    nested('ctrl', 'engineEcu'),
  ]

  it('resolves belong-to layers in the subject\'s scope, not the root scope', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'sw', 'UI'), belong('r2', 'infoEcu', 'Bottom')],
      config,
      arts,
      [],
    )
    expect(c.enabled).toBe(true)
    // Root scope: infoEcu explicit, x and engineEcu auto-assigned.
    expect(c.layerOf.get('infoEcu')).toBe(1)
    expect(c.explicit.has('infoEcu')).toBe(true)
    expect(c.layerOf.has('sw')).toBe(false)
    const info = c.scopes.find((s) => s.containerId === 'infoEcu')!
    expect(info.scopeId).toBe('ecu')
    expect(info.direction).toBe('left-right')
    expect(info.layerOf.get('sw')).toBe(0)
    expect(info.explicit.has('sw')).toBe(true)
    expect(info.autoAssigned).toEqual(['hw'])
    const engine = c.scopes.find((s) => s.containerId === 'engineEcu')!
    expect(engine.scopeId).toBe('ecu')
    expect(engine.layerOf.get('ctrl')).toBe(1)
    expect(c.unknownLayerRuleIds).toEqual([])
  })

  it('auto-assigns within a scope using only links between its siblings', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'sw', 'UI')],
      config,
      arts,
      [
        { source: 'sw', target: 'hw' }, // sibling link → hw after sw
        { source: 'x', target: 'hw' }, // outside the container → ignored
      ],
    )
    const info = c.scopes.find((s) => s.containerId === 'infoEcu')!
    expect(info.layerOf.get('hw')).toBe(1)
  })

  it('a layer name that only exists in the root scope is unknown inside a container', () => {
    const c = buildLayoutConstraints([belong('r1', 'sw', 'Top')], config, arts, [])
    expect(c.unknownLayerRuleIds).toEqual(['r1'])
  })

  it('containers without a matching scope get no layers but keep order rules', () => {
    const noEcu: LayeredLayoutConfig = { ...config, scopes: [config.scopes[0]] }
    const c = buildLayoutConstraints(
      [rule({ id: 'o', namePattern: 'sw', placement: 'to the left of', peerNamePattern: 'hw' })],
      noEcu,
      arts,
      [],
    )
    const info = c.scopes.find((s) => s.containerId === 'infoEcu')!
    expect(info.scopeId).toBeNull()
    expect(info.layerCount).toBe(0)
    expect(info.orderInLayer).toEqual([{ before: 'sw', after: 'hw', ruleId: 'o' }])
  })

  it('rules pairing parts of different containers are reported, not applied', () => {
    const c = buildLayoutConstraints(
      [rule({ id: 'x', namePattern: 'sw', placement: 'above', peerNamePattern: 'ctrl' })],
      config,
      arts,
      [],
    )
    expect(c.crossContainerRuleIds).toEqual(['x'])
    for (const s of c.scopes) expect(s.precedence).toEqual([])
  })

  it('a pattern matching two containers yields two scoped constraint sets', () => {
    const c = buildLayoutConstraints([], config, arts, [])
    const ids = c.scopes.map((s) => s.containerId)
    expect(ids).toEqual([null, 'engineEcu', 'infoEcu'])
    expect(c.scopes[1].layerNames).toEqual(['UI', 'Core'])
    expect(c.scopes[2].layerNames).toEqual(['UI', 'Core'])
  })

  it('without a boundary, parentless parts form the top level', () => {
    const c = buildLayoutConstraints(
      [belong('r1', 'p', 'Top')],
      config,
      [nested('p', null), nested('q', null)],
      [],
    )
    expect(c.layerOf.get('p')).toBe(0)
    expect(c.layerOf.get('q')).toBe(1)
  })
})
