import { describe, expect, it } from 'vitest'
import type { LayoutRuleRow, LayoutScope } from '../../api'
import type { LayoutArtefact } from './layoutWizard'
import {
  addScope,
  buildScopeConstraints,
  findScopeConflicts,
  layoutScopeTargets,
  normalizeLayoutScopes,
  removeScope,
  scopeLabel,
  scopeMembers,
  solveScopeRules,
  updateScope,
  usesLayers,
} from './layoutScopes'

const art = (
  id: string,
  parentId: string | null,
  kind = 'part',
  x = 0,
  y = 0,
): LayoutArtefact => ({ id, name: id, kind, parentId, x, y, width: 100, height: 60 })

/** Package-rooted view: package P (with A, B), part X (with x1, x2), leaf L. */
const pkgView: LayoutArtefact[] = [
  art('P', 'root', 'package'),
  art('A', 'P', 'part', 0, 0),
  art('B', 'P', 'part', 300, 0),
  art('X', 'root', 'part'),
  art('x1', 'X', 'part', 0, 0),
  art('x2', 'X', 'part', 300, 0),
  art('L', 'root', 'part'),
]

const rule = (over: Partial<LayoutRuleRow> = {}): LayoutRuleRow => ({
  id: 'r',
  kind: 'part',
  namePattern: '*',
  placement: 'below',
  peerKind: 'part',
  peerNamePattern: '*',
  ...over,
})

const scope = (over: Partial<LayoutScope> = {}): LayoutScope => ({
  id: 's',
  target: { kind: 'diagram' },
  enabled: true,
  layering: { enabled: false, direction: 'top-down', layers: [] },
  rules: [],
  ...over,
})

describe('layoutScopeTargets', () => {
  it('offers the whole diagram, packages and parts with children', () => {
    const targets = layoutScopeTargets(pkgView, null, [])
    expect(targets.map((t) => scopeLabel(t, pkgView))).toEqual([
      'Whole diagram',
      'Package P',
      'Part X',
    ])
  })

  it('skips the boundary and targets that already have a scope', () => {
    const whitebox = [
      art('Car', null),
      art('ecu', 'Car'),
      art('sw', 'ecu'),
      art('wheel', 'Car'),
    ]
    const used = [scope({ target: { kind: 'diagram' } })]
    expect(layoutScopeTargets(whitebox, 'Car', used)).toEqual([
      { kind: 'element', id: 'ecu' },
    ])
  })
})

describe('scope list helpers', () => {
  it('adds a scope for a target and never a second one for it', () => {
    const one = addScope([], { kind: 'element', id: 'X' })
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ target: { kind: 'element', id: 'X' }, enabled: true })
    expect(addScope(one, { kind: 'element', id: 'X' })).toBe(one)
    expect(new Set(addScope(one, { kind: 'diagram' }).map((s) => s.id)).size).toBe(2)
  })

  it('removes any scope, also the whole-diagram one', () => {
    const scopes = [scope({ id: 'd' }), scope({ id: 'x', target: { kind: 'element', id: 'X' } })]
    expect(removeScope(scopes, 'd').map((s) => s.id)).toEqual(['x'])
    expect(removeScope(scopes, 'x').map((s) => s.id)).toEqual(['d'])
  })

  it('updates one scope only', () => {
    const scopes = [scope({ id: 'd' }), scope({ id: 'x', target: { kind: 'element', id: 'X' } })]
    const next = updateScope(scopes, 'x', (s) => ({ ...s, enabled: false }))
    expect(next.map((s) => s.enabled)).toEqual([true, false])
  })

  it('normalizes saved scopes', () => {
    expect(normalizeLayoutScopes(undefined)).toEqual([])
    const [s] = normalizeLayoutScopes([
      { id: 'a', target: { kind: 'diagram' } } as unknown as LayoutScope,
    ])
    expect(s).toEqual(scope({ id: 'a' }))
  })
})

describe('scopeMembers', () => {
  it('is the direct children of the target', () => {
    const ids = (s: LayoutScope) => scopeMembers(s, pkgView, null).map((a) => a.id)
    expect(ids(scope({ target: { kind: 'element', id: 'X' } }))).toEqual(['x1', 'x2'])
    expect(ids(scope({ target: { kind: 'diagram' } }))).toEqual(['P', 'X', 'L'])
  })
})

describe('buildScopeConstraints', () => {
  const below = rule({ id: 'r1', namePattern: 'x1', peerNamePattern: 'x2' })

  it("applies a scope's rules to its own children only", () => {
    // The same names exist in no other container, but the diagram scope's
    // rule must not reach X's children.
    const c = buildScopeConstraints(
      [
        scope({ id: 'd', rules: [rule({ id: 'top', namePattern: 'x1', peerNamePattern: 'x2' })] }),
        scope({ id: 'x', target: { kind: 'element', id: 'X' }, rules: [below] }),
      ],
      pkgView,
      [],
      { rootId: null, direction: 'top-down' },
    )
    const xScope = c.scopes.find((s) => s.containerId === 'X')!
    expect(xScope.scopeId).toBe('x')
    expect(xScope.precedence.map((e) => e.ruleId)).toEqual(['r1'])
    const top = c.scopes.find((s) => s.containerId === null)!
    expect(top.precedence).toEqual([])
  })

  it('ignores a disabled scope', () => {
    const c = buildScopeConstraints(
      [scope({ id: 'x', target: { kind: 'element', id: 'X' }, enabled: false, rules: [below] })],
      pkgView,
      [],
      { rootId: null },
    )
    expect(c.scopes.find((s) => s.containerId === 'X')).toBeUndefined()
  })

  it('without "use layers" a scope gives rules but no layers', () => {
    const c = buildScopeConstraints(
      [
        scope({
          id: 'x',
          target: { kind: 'element', id: 'X' },
          layering: { enabled: false, direction: 'left-right', layers: [{ id: 'l', name: 'A' }] },
          rules: [below],
        }),
      ],
      pkgView,
      [],
      { rootId: null, direction: 'top-down' },
    )
    const x = c.scopes.find((s) => s.containerId === 'X')!
    expect(x.layerCount).toBe(0)
    expect(x.layerOf.size).toBe(0)
    expect(x.precedence).toHaveLength(1)
  })

  it('with layers a scope assigns its children to them', () => {
    const c = buildScopeConstraints(
      [
        scope({
          id: 'x',
          target: { kind: 'element', id: 'X' },
          layering: {
            enabled: true,
            direction: 'left-right',
            layers: [
              { id: 'l1', name: 'In' },
              { id: 'l2', name: 'Out' },
            ],
          },
          rules: [
            rule({ id: 'b', namePattern: 'x2', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'In' }),
          ],
        }),
      ],
      pkgView,
      [],
      { rootId: null },
    )
    expect(c.enabled).toBe(true)
    const x = c.scopes.find((s) => s.containerId === 'X')!
    expect(x.direction).toBe('left-right')
    expect(x.layerNames).toEqual(['In', 'Out'])
    expect(x.layerOf.get('x2')).toBe(0)
  })

  it('the diagram scope covers the top level, with and without a boundary', () => {
    const whitebox = [art('Car', null), art('a', 'Car'), art('b', 'Car')]
    const c = buildScopeConstraints(
      [scope({ rules: [rule({ id: 'r', namePattern: 'a', peerNamePattern: 'b' })] })],
      whitebox,
      [],
      { rootId: 'Car', direction: 'top-down' },
    )
    expect(c.precedence.map((e) => e.ruleId)).toEqual(['r'])
    const pkg = buildScopeConstraints(
      [scope({ rules: [rule({ id: 'r', namePattern: 'X', peerNamePattern: 'L' })] })],
      pkgView,
      [],
      { rootId: null, direction: 'top-down' },
    )
    expect(pkg.precedence.map((e) => e.ruleId)).toEqual(['r'])
  })
})

describe('conflicts and Apply per scope', () => {
  it('finds a conflict inside a scope and names it', () => {
    const c = findScopeConflicts(
      [
        scope({
          id: 'x',
          target: { kind: 'element', id: 'X' },
          rules: [
            rule({ id: 'a', namePattern: 'x1', placement: 'below', peerNamePattern: 'x2' }),
            rule({ id: 'b', namePattern: 'x1', placement: 'above', peerNamePattern: 'x2' }),
          ],
        }),
      ],
      pkgView,
      null,
    )
    expect(c.rowIds).toEqual(['a', 'b'])
    expect(c.scopeId).toBe('x')
  })

  it('places the children of each enabled scope by its own rules', () => {
    const pos = solveScopeRules(
      [
        scope({
          id: 'x',
          target: { kind: 'element', id: 'X' },
          rules: [rule({ id: 'a', namePattern: 'x2', placement: 'below', peerNamePattern: 'x1' })],
        }),
        scope({
          id: 'p',
          target: { kind: 'element', id: 'P' },
          enabled: false,
          rules: [rule({ id: 'b', namePattern: 'B', placement: 'below', peerNamePattern: 'A' })],
        }),
      ],
      pkgView,
      null,
    )
    expect(pos.x2.y).toBeGreaterThan(pos.x1.y)
    // P's scope is disabled: its children are not moved.
    expect(pos.B).toBeUndefined()
  })

  it('usesLayers is true only for an enabled scope with layers on', () => {
    const on = { enabled: true, direction: 'top-down' as const, layers: [{ id: 'l', name: 'A' }] }
    expect(usesLayers([scope({ layering: on })])).toBe(true)
    expect(usesLayers([scope({ layering: on, enabled: false })])).toBe(false)
    expect(usesLayers([scope()])).toBe(false)
  })
})
