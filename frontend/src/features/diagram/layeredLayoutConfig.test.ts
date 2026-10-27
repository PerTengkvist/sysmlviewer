import { describe, expect, it } from 'vitest'
import type { LayeredLayoutConfig } from '../../api'
import {
  addScope,
  defaultLayeredLayout,
  layerDisplayName,
  layerNameOptionsFor,
  normalizeLayeredLayout,
  removeScope,
  ROOT_SCOPE_PATTERN,
  rootScope,
  scopeForArtefact,
  withScopeDirection,
  withScopeLayerCount,
  withScopeLayerName,
  withScopePattern,
} from './layeredLayoutConfig'

const art = (id: string, name: string, parentId: string | null, kind = 'part') => ({
  id,
  name,
  kind,
  parentId,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
})

describe('layeredLayoutConfig — defaults and migration', () => {
  it('defaults to a disabled root scope with three unnamed layers', () => {
    const c = defaultLayeredLayout()
    expect(c.enabled).toBe(false)
    expect(c.scopes).toHaveLength(1)
    expect(c.scopes[0].scopePattern).toBe(ROOT_SCOPE_PATTERN)
    expect(c.scopes[0].direction).toBe('top-down')
    expect(layerNameOptionsFor(c.scopes[0])).toEqual(['1', '2', '3'])
  })

  it('migrates the legacy single-scope shape', () => {
    const legacy = {
      enabled: true,
      direction: 'left-right',
      layers: [{ id: 'l1', name: 'Front' }],
    } as unknown as LayeredLayoutConfig
    const c = normalizeLayeredLayout(legacy)
    expect(c.enabled).toBe(true)
    expect(c.scopes).toHaveLength(1)
    expect(c.scopes[0]).toMatchObject({
      scopePattern: '*',
      direction: 'left-right',
      layers: [{ id: 'l1', name: 'Front' }],
    })
  })

  it('keeps a valid scopes config and null → default', () => {
    const c = normalizeLayeredLayout(null)
    expect(c.enabled).toBe(false)
    const valid: LayeredLayoutConfig = {
      enabled: true,
      scopes: [
        { id: 's1', scopePattern: '*', direction: 'top-down', layers: [] },
        { id: 's2', scopePattern: 'ecu', direction: 'left-right', layers: [] },
      ],
    }
    expect(normalizeLayeredLayout(valid)).toEqual(valid)
  })
})

describe('layeredLayoutConfig — scope editing', () => {
  it('adds and removes scopes without touching the others', () => {
    let c = defaultLayeredLayout()
    c = addScope(c, 'ecu')
    expect(c.scopes.map((s) => s.scopePattern)).toEqual(['*', 'ecu'])
    c = withScopeLayerName(c, c.scopes[1].id, 0, 'UI')
    c = withScopeLayerCount(c, c.scopes[1].id, 2)
    c = withScopeDirection(c, c.scopes[1].id, 'left-right')
    expect(c.scopes[1].layers).toHaveLength(2)
    expect(c.scopes[1].direction).toBe('left-right')
    expect(layerNameOptionsFor(c.scopes[1])).toEqual(['UI', '2'])
    expect(layerNameOptionsFor(c.scopes[0])).toEqual(['1', '2', '3'])
    c = withScopePattern(c, c.scopes[1].id, '*Ecu')
    expect(c.scopes[1].scopePattern).toBe('*Ecu')
    c = removeScope(c, c.scopes[1].id)
    expect(c.scopes).toHaveLength(1)
  })

  it('never removes the root scope', () => {
    const c = defaultLayeredLayout()
    expect(removeScope(c, c.scopes[0].id).scopes).toHaveLength(1)
    expect(rootScope(c).scopePattern).toBe('*')
  })

  it('keeps names when the count changes and clamps the count', () => {
    let c = defaultLayeredLayout()
    const id = c.scopes[0].id
    c = withScopeLayerName(c, id, 1, 'Control')
    c = withScopeLayerCount(c, id, 5)
    expect(layerDisplayName(c.scopes[0].layers[1], 1)).toBe('Control')
    c = withScopeLayerCount(c, id, 0)
    expect(c.scopes[0].layers).toHaveLength(1)
    c = withScopeLayerCount(c, id, 99)
    expect(c.scopes[0].layers).toHaveLength(12)
  })
})

describe('scopeForArtefact', () => {
  const config: LayeredLayoutConfig = {
    enabled: true,
    scopes: [
      { id: 'root', scopePattern: '*', direction: 'top-down', layers: [] },
      { id: 'ecu', scopePattern: '*Ecu', direction: 'left-right', layers: [] },
    ],
  }
  const artefacts = [
    art('car', 'Car', null),
    art('car::a', 'a', 'car'),
    art('car::infoEcu', 'infoEcu', 'car'),
    art('car::infoEcu::sw', 'sw', 'car::infoEcu'),
    art('car::engineEcu', 'engineEcu', 'car'),
    art('car::engineEcu::ctrl', 'ctrl', 'car::engineEcu'),
  ]

  it('uses the parent name to pick a scope, root scope otherwise', () => {
    expect(scopeForArtefact(config, artefacts[1], artefacts)?.id).toBe('root')
    expect(scopeForArtefact(config, artefacts[3], artefacts)?.id).toBe('ecu')
    expect(scopeForArtefact(config, artefacts[5], artefacts)?.id).toBe('ecu')
    // The container itself is a child of the boundary → root scope.
    expect(scopeForArtefact(config, artefacts[2], artefacts)?.id).toBe('root')
  })

  it('a specific pattern beats the root pattern, later specific scopes win ties', () => {
    const c2: LayeredLayoutConfig = {
      ...config,
      scopes: [
        ...config.scopes,
        { id: 'info', scopePattern: 'infoEcu', direction: 'top-down', layers: [] },
      ],
    }
    expect(scopeForArtefact(c2, artefacts[3], artefacts)?.id).toBe('info')
    expect(scopeForArtefact(c2, artefacts[5], artefacts)?.id).toBe('ecu')
  })

  it('returns null for parts whose parent is not in the view (no root container)', () => {
    expect(scopeForArtefact(config, artefacts[0], artefacts)?.id).toBe('root')
  })
})
