/**
 * Layered-layout config used by the constraint engine
 * (layout/layoutConstraints.ts). The Layout Rules dialog edits scopes
 * (layoutScopes.ts) and hands each one to the engine as a one-scope config
 * whose root (pattern `*`) is that scope's children.
 */
import type {
  LayerDef,
  LayerDirection,
  LayeredLayoutConfig,
  LayeredScope,
} from '../../api'

export const LAYER_DIRECTIONS: LayerDirection[] = [
  'top-down',
  'bottom-up',
  'left-right',
  'right-left',
]

export const MAX_LAYERS = 12
export const ROOT_SCOPE_PATTERN = '*'

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
