/**
 * Pure helpers for the "Layered layout" section of the Layout Rules dialog.
 *
 * A config holds one or more *scopes*. The root scope (pattern `*`) arranges
 * the boundary's direct children; another scope arranges the children of
 * every container whose name matches its pattern.
 */
import type {
  LayerDef,
  LayerDirection,
  LayeredLayoutConfig,
  LayeredScope,
} from '../../api'
import { matchName } from './namePattern'

export const LAYER_DIRECTIONS: LayerDirection[] = [
  'top-down',
  'bottom-up',
  'left-right',
  'right-left',
]

export const MAX_LAYERS = 12
export const ROOT_SCOPE_PATTERN = '*'

/** Minimal artefact shape needed for scope lookup. */
export type ScopeArtefact = {
  id: string
  name: string
  kind: string
  parentId?: string | null
}

export function layerDirectionLabel(direction: LayerDirection): string {
  switch (direction) {
    case 'top-down':
      return 'Top → down'
    case 'bottom-up':
      return 'Bottom → up'
    case 'left-right':
      return 'Left → right'
    case 'right-left':
      return 'Right → left'
  }
}

function makeLayers(count: number, existing: LayerDef[] = []): LayerDef[] {
  const out: LayerDef[] = []
  for (let i = 0; i < count; i++) {
    out.push(existing[i] ?? { id: `layer-${i + 1}`, name: '' })
  }
  return out
}

function newScopeId(config: LayeredLayoutConfig | null): string {
  const used = new Set((config?.scopes || []).map((s) => s.id))
  let n = used.size + 1
  while (used.has(`scope-${n}`)) n += 1
  return `scope-${n}`
}

export function defaultLayeredLayout(): LayeredLayoutConfig {
  return {
    enabled: false,
    scopes: [
      {
        id: 'scope-1',
        scopePattern: ROOT_SCOPE_PATTERN,
        direction: 'top-down',
        layers: makeLayers(3),
      },
    ],
  }
}

const DIRECTIONS = new Set<string>(LAYER_DIRECTIONS)

/**
 * Accept the current shape, the legacy single-scope shape
 * (`{enabled, direction, layers}`) or null, and return a valid config with
 * at least a root scope.
 */
export function normalizeLayeredLayout(
  raw: LayeredLayoutConfig | null | undefined,
): LayeredLayoutConfig {
  if (!raw) return defaultLayeredLayout()
  const legacy = raw as unknown as {
    enabled?: boolean
    direction?: string
    layers?: LayerDef[]
    scopes?: LayeredScope[]
  }
  const rawScopes = Array.isArray(legacy.scopes)
    ? legacy.scopes
    : [
        {
          id: 'scope-1',
          scopePattern: ROOT_SCOPE_PATTERN,
          direction: legacy.direction as LayerDirection,
          layers: legacy.layers ?? [],
        },
      ]
  const used = new Set<string>()
  const scopes: LayeredScope[] = rawScopes
    .filter((s) => s && typeof s === 'object')
    .map((s, i) => {
      let id = String(s.id || '').trim() || `scope-${i + 1}`
      while (used.has(id)) id = `${id}-${i + 1}`
      used.add(id)
      const direction = DIRECTIONS.has(String(s.direction))
        ? (s.direction as LayerDirection)
        : 'top-down'
      return {
        id,
        scopePattern: String(s.scopePattern || '').trim() || ROOT_SCOPE_PATTERN,
        direction,
        layers: (Array.isArray(s.layers) ? s.layers : []).map((l, j) => ({
          id: String(l?.id || '').trim() || `layer-${j + 1}`,
          name: String(l?.name ?? ''),
        })),
      }
    })
  if (!scopes.some((s) => s.scopePattern === ROOT_SCOPE_PATTERN)) {
    scopes.unshift({
      id: newScopeId({ enabled: false, scopes }),
      scopePattern: ROOT_SCOPE_PATTERN,
      direction: 'top-down',
      layers: makeLayers(3),
    })
  }
  return { enabled: !!legacy.enabled, scopes }
}

export function rootScope(config: LayeredLayoutConfig): LayeredScope {
  return (
    config.scopes.find((s) => s.scopePattern === ROOT_SCOPE_PATTERN) ??
    config.scopes[0]
  )
}

/** Display name of a layer: its name or its 1-based ordinal. */
export function layerDisplayName(layer: LayerDef, index: number): string {
  return layer.name.trim() || String(index + 1)
}

/** Names offered in the "Peer name" select for `belong to` rules. */
export function layerNameOptionsFor(scope: LayeredScope | null): string[] {
  if (!scope) return []
  return scope.layers.map((l, i) => layerDisplayName(l, i))
}

function updateScope(
  config: LayeredLayoutConfig,
  scopeId: string,
  fn: (s: LayeredScope) => LayeredScope,
): LayeredLayoutConfig {
  return {
    ...config,
    scopes: config.scopes.map((s) => (s.id === scopeId ? fn(s) : s)),
  }
}

export function addScope(
  config: LayeredLayoutConfig,
  scopePattern: string,
): LayeredLayoutConfig {
  return {
    ...config,
    scopes: [
      ...config.scopes,
      {
        id: newScopeId(config),
        scopePattern: scopePattern.trim() || ROOT_SCOPE_PATTERN,
        direction: 'top-down',
        layers: makeLayers(2),
      },
    ],
  }
}

/** Remove a scope; the root scope is kept. */
export function removeScope(
  config: LayeredLayoutConfig,
  scopeId: string,
): LayeredLayoutConfig {
  const target = config.scopes.find((s) => s.id === scopeId)
  if (!target || target.scopePattern === ROOT_SCOPE_PATTERN) return config
  return { ...config, scopes: config.scopes.filter((s) => s.id !== scopeId) }
}

export function withScopePattern(
  config: LayeredLayoutConfig,
  scopeId: string,
  pattern: string,
): LayeredLayoutConfig {
  return updateScope(config, scopeId, (s) => ({ ...s, scopePattern: pattern }))
}

export function withScopeDirection(
  config: LayeredLayoutConfig,
  scopeId: string,
  direction: LayerDirection,
): LayeredLayoutConfig {
  return updateScope(config, scopeId, (s) => ({ ...s, direction }))
}

/** Grow/shrink the layer list of a scope, keeping existing names. */
export function withScopeLayerCount(
  config: LayeredLayoutConfig,
  scopeId: string,
  count: number,
): LayeredLayoutConfig {
  const n = Math.max(1, Math.min(MAX_LAYERS, Math.floor(count) || 1))
  return updateScope(config, scopeId, (s) => ({
    ...s,
    layers: makeLayers(n, s.layers),
  }))
}

export function withScopeLayerName(
  config: LayeredLayoutConfig,
  scopeId: string,
  index: number,
  name: string,
): LayeredLayoutConfig {
  return updateScope(config, scopeId, (s) => ({
    ...s,
    layers: s.layers.map((l, i) => (i === index ? { ...l, name } : l)),
  }))
}

/**
 * Scope that arranges `artefact`: the most specific scope whose pattern
 * matches the artefact's parent name (later scopes win ties). Parts whose
 * parent is not a part in the view (top-level) use the root scope.
 */
export function scopeForArtefact(
  config: LayeredLayoutConfig,
  artefact: ScopeArtefact,
  artefacts: ScopeArtefact[],
): LayeredScope | null {
  const parent = artefact.parentId
    ? artefacts.find((a) => a.id === artefact.parentId)
    : undefined
  const root = rootScope(config)
  if (!parent) return root
  let best: LayeredScope | null = null
  for (const s of config.scopes) {
    if (s.scopePattern === ROOT_SCOPE_PATTERN) continue
    if (matchName(s.scopePattern, parent.name)) best = s
  }
  return best ?? root
}

/** Container names in the view that have part children (scope candidates). */
export function containerNames(artefacts: ScopeArtefact[]): string[] {
  const parents = new Set(
    artefacts.map((a) => a.parentId).filter((p): p is string => !!p),
  )
  const byId = new Map(artefacts.map((a) => [a.id, a]))
  const names = new Set<string>()
  for (const id of parents) {
    const a = byId.get(id)
    if (a && a.parentId && byId.has(a.parentId)) names.add(a.name)
  }
  return [...names].sort()
}
