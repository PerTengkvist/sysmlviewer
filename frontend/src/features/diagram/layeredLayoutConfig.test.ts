import { describe, expect, it } from 'vitest'
import type { LayeredLayoutConfig } from '../../api'
import {
  defaultLayeredLayout,
  layerDisplayName,
  normalizeLayeredLayout,
  ROOT_SCOPE_PATTERN,
} from './layeredLayoutConfig'

describe('layeredLayoutConfig — defaults and migration', () => {
  it('defaults to a disabled root scope with three unnamed layers', () => {
    const c = defaultLayeredLayout()
    expect(c.enabled).toBe(false)
    expect(c.scopes).toHaveLength(1)
    expect(c.scopes[0].scopePattern).toBe(ROOT_SCOPE_PATTERN)
    expect(c.scopes[0].direction).toBe('top-down')
    expect(c.scopes[0].layers.map((l, i) => layerDisplayName(l, i))).toEqual(['1', '2', '3'])
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
