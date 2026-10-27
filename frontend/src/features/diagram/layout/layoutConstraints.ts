/**
 * Turn Layout Rules (+ the per-view Layered layout config) into hard layout
 * constraints that the hierarchic pipeline and the band solver consume.
 *
 * Constraints are computed per *scope*: the boundary's direct children (root
 * scope, pattern `*`) and the children of every container that matches a
 * scope pattern. Per scope:
 *
 * - `layerOf`: layer index per part (explicit `belong to`, or auto-assigned
 *   from connectivity when layered layout is enabled).
 * - `precedence`: A before B along the scope's layout direction.
 * - `orderInLayer`: A before B perpendicular to the direction.
 *
 * The root scope's fields are also exposed flat on `LayoutConstraints` for
 * the common whitebox case (boundary + children).
 */
import type {
  LayerDirection,
  LayeredLayoutConfig,
  LayeredScope,
  LayoutRuleRow,
} from '../../../api'
import { matchName } from '../namePattern'
import {
  normalizeLayeredLayout,
  ROOT_SCOPE_PATTERN,
  rootScope,
} from '../layeredLayoutConfig'

/** Mirrors `LayoutArtefact` in layoutWizard.ts (kept local to avoid an import cycle). */
export type ConstraintArtefact = {
  id: string
  name: string
  kind: string
  /** Parent artefact id (null/undefined for top-level). */
  parentId?: string | null
}

const ABSOLUTE_PLACEMENTS = new Set(['bottom', 'top', 'rightmost', 'leftmost'])

function matchArtefacts<T extends ConstraintArtefact>(
  artefacts: T[],
  kind: string,
  namePattern: string,
): T[] {
  const pattern = namePattern || '*'
  return artefacts.filter((a) => a.kind === kind && matchName(pattern, a.name))
}

export type OrderConstraint = { before: string; after: string; ruleId: string }

export type ConstraintLink = { source: string; target: string }

/** Constraints for the children of one container (or the top level). */
export type ScopeConstraints = {
  /** Id of the layered scope, or null when no scope applies to this container. */
  scopeId: string | null
  /** Container whose children these are; null = top level under the boundary. */
  containerId: string | null
  direction: LayerDirection
  layerCount: number
  layerNames: string[]
  layerOf: Map<string, number>
  explicit: Set<string>
  autoAssigned: string[]
  precedence: OrderConstraint[]
  orderInLayer: OrderConstraint[]
}

export type LayoutConstraints = {
  /** True when the view's layered layout is enabled. */
  enabled: boolean
  // --- root scope (top-level parts), flat for convenience ---
  direction: LayerDirection
  layerCount: number
  layerNames: string[]
  layerOf: Map<string, number>
  explicit: Set<string>
  autoAssigned: string[]
  precedence: OrderConstraint[]
  orderInLayer: OrderConstraint[]
  // --- all scopes, including the root one (containerId null) ---
  scopes: ScopeConstraints[]
  /** `belong to` rows whose layer name matches nothing in the subject's scope. */
  unknownLayerRuleIds: string[]
  /** Order/precedence rows that pair parts of different containers. */
  crossContainerRuleIds: string[]
}

export type BuildConstraintOptions = {
  /** Direction when layered layout is not enabled. Default 'left-right'. */
  direction?: LayerDirection
  /** Boundary artefact id; inferred when omitted (single parentless container). */
  rootId?: string | null
}

export const BELONG_TO = 'belong to'

export function isVerticalDirection(direction: LayerDirection): boolean {
  return direction === 'top-down' || direction === 'bottom-up'
}

const VERTICAL_PLACEMENTS = new Set(['above', 'below', 'top', 'bottom'])
const HORIZONTAL_PLACEMENTS = new Set([
  'to the left of',
  'to the right of',
  'leftmost',
  'rightmost',
])

/** Resolve a layer reference (name or 1-based ordinal) to an index in a scope. */
export function resolveLayerIndex(
  scope: LayeredScope,
  ref: string | null | undefined,
): number | null {
  const wanted = (ref || '').trim()
  if (!wanted) return null
  const byName = scope.layers.findIndex(
    (l, i) => (l.name || String(i + 1)).trim() === wanted,
  )
  if (byName >= 0) return byName
  const ordinal = Number(wanted)
  if (
    Number.isInteger(ordinal) &&
    ordinal >= 1 &&
    ordinal <= scope.layers.length
  ) {
    return ordinal - 1
  }
  return null
}

function expandPairs(
  rule: LayoutRuleRow,
  artefacts: ConstraintArtefact[],
): { subjects: ConstraintArtefact[]; peers: ConstraintArtefact[] } {
  const subjects = matchArtefacts(artefacts, rule.kind, rule.namePattern || '*')
  if (ABSOLUTE_PLACEMENTS.has(rule.placement)) {
    const ids = new Set(subjects.map((s) => s.id))
    return { subjects, peers: artefacts.filter((a) => !ids.has(a.id)) }
  }
  const peers = matchArtefacts(
    artefacts,
    rule.peerKind || '',
    rule.peerNamePattern || '*',
  )
  return { subjects, peers }
}

/**
 * Geometric order edges for one rule: `before` is above/left of `after`.
 * Returns the geometric axis so the caller can map it onto the direction.
 */
function geometricEdges(
  rule: LayoutRuleRow,
  artefacts: ConstraintArtefact[],
): { axis: 'vertical' | 'horizontal'; edges: OrderConstraint[] } | null {
  const p = rule.placement
  const axis = VERTICAL_PLACEMENTS.has(p)
    ? 'vertical'
    : HORIZONTAL_PLACEMENTS.has(p)
      ? 'horizontal'
      : null
  if (!axis) return null
  const { subjects, peers } = expandPairs(rule, artefacts)
  const subjectFirst =
    p === 'above' || p === 'top' || p === 'to the left of' || p === 'leftmost'
  const edges: OrderConstraint[] = []
  for (const s of subjects) {
    for (const q of peers) {
      if (s.id === q.id) continue
      edges.push(
        subjectFirst
          ? { before: s.id, after: q.id, ruleId: rule.id }
          : { before: q.id, after: s.id, ruleId: rule.id },
      )
    }
  }
  return { axis, edges }
}

function dedupe(edges: OrderConstraint[]): OrderConstraint[] {
  const seen = new Set<string>()
  const out: OrderConstraint[] = []
  for (const e of edges) {
    const key = `${e.before}->${e.after}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}


/** Infer the boundary: the single parentless artefact that has children. */
export function inferRootId(artefacts: ConstraintArtefact[]): string | null {
  const ids = new Set(artefacts.map((a) => a.id))
  const parentless = artefacts.filter((a) => !a.parentId || !ids.has(a.parentId))
  const withChildren = parentless.filter((p) =>
    artefacts.some((a) => a.parentId === p.id),
  )
  return parentless.length === 1 && withChildren.length === 1
    ? withChildren[0].id
    : null
}

type Group = { containerId: string | null; members: ConstraintArtefact[] }

/** Group artefacts by container; the boundary's children form the top level. */
export function groupByContainer(
  artefacts: ConstraintArtefact[],
  rootId: string | null,
): Group[] {
  const ids = new Set(artefacts.map((a) => a.id))
  const groups = new Map<string | null, ConstraintArtefact[]>()
  for (const a of artefacts) {
    if (a.id === rootId) continue
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null
    const key = parent === rootId ? null : parent
    groups.set(key, [...(groups.get(key) || []), a])
  }
  const out: Group[] = []
  for (const [containerId, members] of groups) {
    out.push({
      containerId,
      members: [...members].sort((x, y) => x.id.localeCompare(y.id)),
    })
  }
  return out.sort((g1, g2) => {
    if (g1.containerId === null) return -1
    if (g2.containerId === null) return 1
    return g1.containerId.localeCompare(g2.containerId)
  })
}

/** Non-root scope for a container name (later scopes win ties), else null. */
function scopeForContainer(
  config: LayeredLayoutConfig,
  containerName: string,
): LayeredScope | null {
  let best: LayeredScope | null = null
  for (const s of config.scopes) {
    if (s.scopePattern === ROOT_SCOPE_PATTERN) continue
    if (matchName(s.scopePattern, containerName)) best = s
  }
  return best
}

/** Rule → order edges for a group, mapped onto the scope's direction. */
function groupEdges(
  rules: LayoutRuleRow[],
  members: ConstraintArtefact[],
  direction: LayerDirection,
): { precedence: OrderConstraint[]; orderInLayer: OrderConstraint[] } {
  const vertical = isVerticalDirection(direction)
  const reversed = direction === 'bottom-up' || direction === 'right-left'
  const precedence: OrderConstraint[] = []
  const orderInLayer: OrderConstraint[] = []
  for (const rule of rules) {
    const g = geometricEdges(rule, members)
    if (!g) continue
    const along = vertical ? g.axis === 'vertical' : g.axis === 'horizontal'
    if (along) {
      for (const e of g.edges) {
        precedence.push(
          reversed ? { before: e.after, after: e.before, ruleId: e.ruleId } : e,
        )
      }
    } else {
      orderInLayer.push(...g.edges)
    }
  }
  return { precedence: dedupe(precedence), orderInLayer: dedupe(orderInLayer) }
}

function emptyScope(
  containerId: string | null,
  direction: LayerDirection,
): ScopeConstraints {
  return {
    scopeId: null,
    containerId,
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

export type LayeredConflict = { rowIds: string[]; message: string }

/**
 * Conflicts specific to layered layout: unknown layer names, one part sent
 * to two layers, in-layer order rules across layers, precedence rules
 * contradicting explicit layers, and rules pairing parts of different
 * containers. Empty when layered layout is disabled.
 */
export function findLayeredConflicts(
  rules: LayoutRuleRow[],
  layered: LayeredLayoutConfig | null | undefined,
  artefacts: ConstraintArtefact[],
  opts: BuildConstraintOptions = {},
): LayeredConflict {
  if (!layered?.enabled) return { rowIds: [], message: '' }
  const config = normalizeLayeredLayout(layered)
  const rootId = opts.rootId !== undefined ? opts.rootId : inferRootId(artefacts)
  const bad = new Set<string>()
  const messages: string[] = []
  const byId = new Map(artefacts.map((a) => [a.id, a]))

  for (const group of groupByContainer(artefacts, rootId)) {
    const container = group.containerId ? byId.get(group.containerId) : null
    const scope =
      group.containerId === null
        ? rootScope(config)
        : container
          ? scopeForContainer(config, container.name)
          : null
    const assigned = new Map<string, { layer: number; ruleId: string }>()
    for (const rule of rules) {
      if (rule.placement !== BELONG_TO) continue
      const subjects = matchArtefacts(group.members, rule.kind, rule.namePattern || '*')
      if (!subjects.length) continue
      if (!scope) {
        bad.add(rule.id)
        messages.push(
          `No layered scope applies to "${container?.name ?? ''}" for a "belong to" rule.`,
        )
        continue
      }
      const index = resolveLayerIndex(scope, rule.peerNamePattern)
      if (index == null) {
        bad.add(rule.id)
        messages.push(
          `Unknown layer name in "belong to" rule for scope "${scope.scopePattern}".`,
        )
        continue
      }
      for (const s of subjects) {
        const prev = assigned.get(s.id)
        if (prev && prev.layer !== index) {
          bad.add(prev.ruleId)
          bad.add(rule.id)
          messages.push(`"${s.name}" belongs to two different layers.`)
        } else if (!prev) {
          assigned.set(s.id, { layer: index, ruleId: rule.id })
        }
      }
    }
    const direction = scope?.direction ?? rootScope(config).direction
    const edges = groupEdges(
      rules.filter((r) => r.placement !== BELONG_TO),
      group.members,
      direction,
    )
    const layerOf = (id: string) => assigned.get(id)?.layer
    for (const e of edges.orderInLayer) {
      const a = layerOf(e.before)
      const b = layerOf(e.after)
      if (a != null && b != null && a !== b) {
        bad.add(e.ruleId)
        messages.push('Side-by-side rule between parts in different layers.')
      }
    }
    for (const e of edges.precedence) {
      const a = layerOf(e.before)
      const b = layerOf(e.after)
      if (a != null && b != null && a > b) {
        bad.add(e.ruleId)
        messages.push('Order rule contradicts the layers the parts belong to.')
      }
    }
  }

  for (const id of crossContainerRules(rules, artefacts, rootId)) {
    bad.add(id)
    messages.push('Order rule pairs parts of different containers.')
  }
  return {
    rowIds: [...bad].sort(),
    message: [...new Set(messages)].join(' '),
  }
}

/** Rule ids whose order/precedence pairs span two containers. */
function crossContainerRules(
  rules: LayoutRuleRow[],
  artefacts: ConstraintArtefact[],
  rootId: string | null,
): string[] {
  const ids = new Set(artefacts.map((a) => a.id))
  const containerOf = new Map<string, string | null>()
  for (const a of artefacts) {
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null
    containerOf.set(a.id, parent === rootId ? null : parent)
  }
  const out = new Set<string>()
  for (const rule of rules) {
    const g = geometricEdges(rule, artefacts.filter((a) => a.id !== rootId))
    if (!g) continue
    for (const e of g.edges) {
      if (containerOf.get(e.before) !== containerOf.get(e.after)) out.add(e.ruleId)
    }
  }
  return [...out].sort()
}

export function buildLayoutConstraints(
  rules: LayoutRuleRow[],
  layered: LayeredLayoutConfig | null | undefined,
  artefacts: ConstraintArtefact[],
  links: ConstraintLink[],
  opts: BuildConstraintOptions = {},
): LayoutConstraints {
  const enabled = !!layered?.enabled
  const config = layered ? normalizeLayeredLayout(layered) : null
  const rootDirection: LayerDirection =
    enabled && config ? rootScope(config).direction : (opts.direction ?? 'left-right')
  const rootId = opts.rootId !== undefined ? opts.rootId : inferRootId(artefacts)
  const byId = new Map(artefacts.map((a) => [a.id, a]))
  const unknownLayerRuleIds = new Set<string>()
  const scopes: ScopeConstraints[] = []

  for (const group of groupByContainer(artefacts, rootId)) {
    const container = group.containerId ? byId.get(group.containerId) : null
    const scope =
      enabled && config
        ? group.containerId === null
          ? rootScope(config)
          : container
            ? scopeForContainer(config, container.name)
            : null
        : null
    const direction = scope?.direction ?? rootDirection
    const sc = emptyScope(group.containerId, direction)
    sc.scopeId = scope?.id ?? null
    const edges = groupEdges(rules, group.members, direction)
    sc.precedence = edges.precedence
    sc.orderInLayer = edges.orderInLayer

    if (scope) {
      sc.layerCount = scope.layers.length
      sc.layerNames = scope.layers.map((l, i) => l.name || String(i + 1))
      for (const rule of rules) {
        if (rule.placement !== BELONG_TO) continue
        const subjects = matchArtefacts(group.members, rule.kind, rule.namePattern || '*')
        if (!subjects.length) continue
        const index = resolveLayerIndex(scope, rule.peerNamePattern)
        if (index == null) {
          unknownLayerRuleIds.add(rule.id)
          continue
        }
        for (const s of subjects) {
          if (!sc.layerOf.has(s.id)) {
            sc.layerOf.set(s.id, index)
            sc.explicit.add(s.id)
          }
        }
      }
      const memberIds = new Set(group.members.map((m) => m.id))
      autoAssignLayers(
        group.members,
        sc.layerOf,
        sc.explicit,
        links.filter((l) => memberIds.has(l.source) && memberIds.has(l.target)),
        scope.layers.length,
        sc.orderInLayer,
        sc.precedence,
      )
      sc.autoAssigned = group.members
        .map((m) => m.id)
        .filter((id) => sc.layerOf.has(id) && !sc.explicit.has(id))
        .sort()
    }
    scopes.push(sc)
  }

  const root = scopes.find((s) => s.containerId === null) ?? emptyScope(null, rootDirection)
  if (!scopes.some((s) => s.containerId === null)) scopes.unshift(root)

  return {
    enabled,
    direction: root.direction,
    layerCount: root.layerCount,
    layerNames: root.layerNames,
    layerOf: root.layerOf,
    explicit: root.explicit,
    autoAssigned: root.autoAssigned,
    precedence: root.precedence,
    orderInLayer: root.orderInLayer,
    scopes,
    unknownLayerRuleIds: [...unknownLayerRuleIds].sort(),
    crossContainerRuleIds: crossContainerRules(rules, artefacts, rootId),
  }
}

/**
 * Fill `layerOf` for parts without a `belong to` rule:
 * 1. in-layer order rules pull the part into its peer's layer,
 * 2. barycentre of linked neighbours' layers (Jacobi iterations),
 * 3. precedence relaxation, 4. last layer as fallback.
 */
function autoAssignLayers(
  artefacts: ConstraintArtefact[],
  layerOf: Map<string, number>,
  explicit: Set<string>,
  links: ConstraintLink[],
  layerCount: number,
  orderInLayer: OrderConstraint[],
  precedence: OrderConstraint[],
): void {
  if (layerCount <= 0) return
  const ids = artefacts.map((a) => a.id).sort()
  const last = layerCount - 1
  const clamp = (v: number) => Math.max(0, Math.min(last, v))

  // 1. Same-layer propagation through in-layer order rules.
  let changed = true
  let guard = 0
  while (changed && guard++ < 20) {
    changed = false
    for (const e of orderInLayer) {
      const a = layerOf.get(e.before)
      const b = layerOf.get(e.after)
      if (a != null && b == null) {
        layerOf.set(e.after, a)
        changed = true
      } else if (b != null && a == null) {
        layerOf.set(e.before, b)
        changed = true
      }
    }
  }

  // 2. Directed barycentre of neighbours: after sources, before targets
  //    (only unassigned parts move).
  const neighbours = new Map<string, { id: string; delta: number }[]>()
  const idSet = new Set(ids)
  for (const l of links) {
    if (!idSet.has(l.source) || !idSet.has(l.target)) continue
    if (l.source === l.target) continue
    neighbours.set(l.source, [
      ...(neighbours.get(l.source) || []),
      { id: l.target, delta: -1 },
    ])
    neighbours.set(l.target, [
      ...(neighbours.get(l.target) || []),
      { id: l.source, delta: 1 },
    ])
  }
  const free = ids.filter((id) => !layerOf.has(id))
  for (let iter = 0; iter < 10 && free.length; iter++) {
    const next = new Map<string, number>()
    let moved = false
    for (const id of free) {
      const vals = (neighbours.get(id) || [])
        .map((n) => {
          const v = layerOf.get(n.id)
          return v == null ? null : v + n.delta
        })
        .filter((v): v is number => v != null)
      if (!vals.length) continue
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      const target = clamp(Math.round(mean))
      if (layerOf.get(id) !== target) moved = true
      next.set(id, target)
    }
    for (const [id, v] of next) layerOf.set(id, v)
    if (!moved) break
  }

  // 3. Precedence relaxation on auto-assigned parts.
  guard = 0
  changed = true
  while (changed && guard++ < 20) {
    changed = false
    for (const e of precedence) {
      const a = layerOf.get(e.before)
      const b = layerOf.get(e.after)
      if (a == null || b == null || a <= b) continue
      if (!explicit.has(e.after)) {
        layerOf.set(e.after, clamp(a))
        changed = true
      } else if (!explicit.has(e.before)) {
        layerOf.set(e.before, clamp(b))
        changed = true
      }
    }
  }
  // Precedence from an assigned part to an unassigned one.
  for (const e of precedence) {
    const a = layerOf.get(e.before)
    const b = layerOf.get(e.after)
    if (a != null && b == null) layerOf.set(e.after, clamp(a))
    else if (b != null && a == null) layerOf.set(e.before, clamp(b))
  }

  // 4. Fallback: last layer.
  for (const id of ids) {
    if (!layerOf.has(id)) layerOf.set(id, last)
  }
}
