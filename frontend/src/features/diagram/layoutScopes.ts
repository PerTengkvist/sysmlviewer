/**
 * Layout Rules scopes: each tab of the dialog is one scope. A scope targets
 * the whole diagram or one container (a package, or a part with children),
 * and its rules and layers arrange that target's direct children only.
 *
 * The constraint engine (layout/layoutConstraints.ts) and the plain solver
 * (layoutWizard.ts) work on one group of siblings; this module runs them per
 * enabled scope and combines the result.
 */
import type {
  LayeredLayoutConfig,
  LayerDirection,
  LayoutScope,
  LayoutScopeTarget,
} from '../../api'
import {
  buildLayoutConstraints,
  type ConstraintArtefact,
  type ConstraintLink,
  type LayoutConstraints,
  type ScopeConstraints,
} from './layout/layoutConstraints'
import { LAYER_DIRECTIONS } from './layeredLayoutConfig'
import {
  findLayoutConflicts,
  solveLayoutRules,
  type LayoutArtefact,
  type LayoutConflict,
} from './layoutWizard'

const DIRECTIONS = new Set<string>(LAYER_DIRECTIONS)

export function sameTarget(a: LayoutScopeTarget, b: LayoutScopeTarget): boolean {
  if (a.kind === 'diagram' || b.kind === 'diagram') return a.kind === b.kind
  return a.id === b.id
}

/** Tab label: "Whole diagram", "Package Name" or "Part Name". */
export function scopeLabel(
  target: LayoutScopeTarget,
  artefacts: Pick<ConstraintArtefact, 'id' | 'name' | 'kind'>[],
): string {
  if (target.kind === 'diagram') return 'Whole diagram'
  const el = artefacts.find((a) => a.id === target.id)
  if (!el) return `Missing ${target.id.split('::').pop()}`
  return `${el.kind === 'package' ? 'Package' : 'Part'} ${el.name}`
}

/**
 * Targets a new scope can have: the whole diagram, each package and each
 * part with children in the diagram. The boundary (whitebox root) is the
 * whole diagram already; targets that have a scope are left out.
 */
export function layoutScopeTargets(
  artefacts: ConstraintArtefact[],
  boundaryId: string | null,
  used: LayoutScope[],
): LayoutScopeTarget[] {
  const taken = (t: LayoutScopeTarget) => used.some((s) => sameTarget(s.target, t))
  const out: LayoutScopeTarget[] = []
  if (!taken({ kind: 'diagram' })) out.push({ kind: 'diagram' })
  const parents = new Set(artefacts.map((a) => a.parentId).filter(Boolean))
  for (const a of artefacts) {
    if (a.id === boundaryId) continue
    const container = a.kind === 'package' || (a.kind === 'part' && parents.has(a.id))
    if (!container) continue
    const target: LayoutScopeTarget = { kind: 'element', id: a.id }
    if (!taken(target)) out.push(target)
  }
  return out
}

function newScopeId(scopes: LayoutScope[]): string {
  const used = new Set(scopes.map((s) => s.id))
  let n = scopes.length + 1
  while (used.has(`scope-${n}`)) n += 1
  return `scope-${n}`
}

/** New scope for `target`; the list is returned unchanged if it has one. */
export function addScope(scopes: LayoutScope[], target: LayoutScopeTarget): LayoutScope[] {
  if (scopes.some((s) => sameTarget(s.target, target))) return scopes
  return [
    ...scopes,
    {
      id: newScopeId(scopes),
      target,
      enabled: true,
      layering: { enabled: false, direction: 'top-down', layers: [] },
      rules: [],
    },
  ]
}

export function removeScope(scopes: LayoutScope[], scopeId: string): LayoutScope[] {
  return scopes.filter((s) => s.id !== scopeId)
}

export function updateScope(
  scopes: LayoutScope[],
  scopeId: string,
  fn: (scope: LayoutScope) => LayoutScope,
): LayoutScope[] {
  return scopes.map((s) => (s.id === scopeId ? fn(s) : s))
}

/** Saved scopes with defaults filled in; unknown or duplicate targets dropped. */
export function normalizeLayoutScopes(raw: LayoutScope[] | null | undefined): LayoutScope[] {
  if (!Array.isArray(raw)) return []
  const out: LayoutScope[] = []
  for (const s of raw) {
    const t = s?.target as LayoutScopeTarget | undefined
    const target: LayoutScopeTarget | null =
      t?.kind === 'diagram'
        ? { kind: 'diagram' }
        : t?.kind === 'element' && t.id
          ? { kind: 'element', id: t.id }
          : null
    if (!target || out.some((o) => sameTarget(o.target, target))) continue
    const layering = s.layering || ({} as LayoutScope['layering'])
    out.push({
      id: String(s.id || '') || newScopeId(out),
      target,
      enabled: s.enabled ?? true,
      layering: {
        enabled: !!layering.enabled,
        direction: DIRECTIONS.has(String(layering.direction))
          ? (layering.direction as LayerDirection)
          : 'top-down',
        layers: Array.isArray(layering.layers) ? layering.layers : [],
      },
      rules: Array.isArray(s.rules) ? s.rules : [],
    })
  }
  return out
}

/** Whether any enabled scope arranges its children in layers. */
export function usesLayers(scopes: LayoutScope[]): boolean {
  return scopes.some((s) => s.enabled && s.layering.enabled && s.layering.layers.length > 0)
}

/** The artefacts a scope arranges: the target's direct children. */
export function scopeMembers<T extends ConstraintArtefact>(
  scope: LayoutScope,
  artefacts: T[],
  boundaryId: string | null,
): T[] {
  const target = scope.target
  if (target.kind === 'element') return artefacts.filter((a) => a.parentId === target.id)
  const ids = new Set(artefacts.map((a) => a.id))
  return artefacts.filter((a) => {
    if (a.id === boundaryId) return false
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null
    return parent === null || parent === boundaryId
  })
}

/** One scope's layers in the engine's config shape (its members are the root). */
function layeredConfigFor(scope: LayoutScope): LayeredLayoutConfig | null {
  if (!scope.layering.enabled) return null
  return {
    enabled: true,
    scopes: [
      {
        id: scope.id,
        scopePattern: '*',
        direction: scope.layering.direction,
        layers: scope.layering.layers,
      },
    ],
  }
}

function emptyScopeConstraints(direction: LayerDirection): ScopeConstraints {
  return {
    scopeId: null,
    containerId: null,
    direction,
    layerCount: 0,
    layerNames: [],
    layerOf: new Map(),
    explicit: new Set(),
    autoAssigned: [],
    precedence: [],
    orderInLayer: [],
  }
}

/**
 * Hard constraints for the hierarchic pipeline: one constraint set per
 * enabled scope, built from that scope's rules over its direct children.
 */
export function buildScopeConstraints(
  scopes: LayoutScope[],
  artefacts: ConstraintArtefact[],
  links: ConstraintLink[],
  opts: { rootId: string | null; direction?: LayerDirection },
): LayoutConstraints {
  const fallback = opts.direction ?? 'left-right'
  const built: ScopeConstraints[] = []
  const unknown = new Set<string>()
  for (const scope of scopes) {
    if (!scope.enabled) continue
    const members = scopeMembers(scope, artefacts, opts.rootId)
    if (!members.length) continue
    const one = buildLayoutConstraints(scope.rules, layeredConfigFor(scope), members, links, {
      rootId: null,
      direction: fallback,
    })
    for (const id of one.unknownLayerRuleIds) unknown.add(id)
    const top = one.scopes.find((s) => s.containerId === null) ?? emptyScopeConstraints(fallback)
    built.push({
      ...top,
      scopeId: scope.id,
      containerId: scope.target.kind === 'element' ? scope.target.id : null,
    })
  }
  const root = built.find((s) => s.containerId === null) ?? emptyScopeConstraints(fallback)
  const rest = built
    .filter((s) => s.containerId !== null)
    .sort((a, b) => String(a.containerId).localeCompare(String(b.containerId)))
  return {
    enabled: usesLayers(scopes),
    direction: root.direction,
    layerCount: root.layerCount,
    layerNames: root.layerNames,
    layerOf: root.layerOf,
    explicit: root.explicit,
    autoAssigned: root.autoAssigned,
    precedence: root.precedence,
    orderInLayer: root.orderInLayer,
    scopes: [root, ...rest],
    unknownLayerRuleIds: [...unknown].sort(),
    // A scope's rules only ever see its own children.
    crossContainerRuleIds: [],
  }
}

/** First conflict among the enabled scopes, with the scope it is in. */
export function findScopeConflicts(
  scopes: LayoutScope[],
  artefacts: LayoutArtefact[],
  boundaryId: string | null,
): LayoutConflict & { scopeId: string | null } {
  for (const scope of scopes) {
    if (!scope.enabled) continue
    const members = scopeMembers(scope, artefacts, boundaryId)
    const c = findLayoutConflicts(scope.rules, members, layeredConfigFor(scope))
    if (c.rowIds.length) return { ...c, scopeId: scope.id }
  }
  return { message: '', rowIds: [], scopeId: null }
}

/** Apply without layers: each enabled scope places its own children. */
export function solveScopeRules(
  scopes: LayoutScope[],
  artefacts: LayoutArtefact[],
  boundaryId: string | null,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const scope of scopes) {
    if (!scope.enabled || !scope.rules.length) continue
    const members = scopeMembers(scope, artefacts, boundaryId)
    Object.assign(positions, solveLayoutRules(members, scope.rules))
  }
  return positions
}

/** Grow or shrink a layer list to `count`, keeping existing names. */
export function withLayerCount(
  layers: LayoutScope['layering']['layers'],
  count: number,
  max: number,
): LayoutScope['layering']['layers'] {
  const n = Math.max(1, Math.min(max, Math.floor(count) || 1))
  return Array.from({ length: n }, (_, i) => layers[i] ?? { id: `layer-${i + 1}`, name: '' })
}
