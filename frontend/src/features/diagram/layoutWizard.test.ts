import { describe, expect, it } from 'vitest'
import type { LayoutRuleRow } from '../../api'
import {
  findLayoutConflicts,
  matchArtefacts,
  solveLayoutRules,
  type LayoutArtefact,
} from './layoutWizard'

function art(
  id: string,
  name: string,
  kind = 'part',
  x = 0,
  y = 0,
  w = 100,
  h = 40,
): LayoutArtefact {
  return { id, name, kind, x, y, width: w, height: h }
}

function rule(
  partial: Partial<LayoutRuleRow> & Pick<LayoutRuleRow, 'id' | 'placement'>,
): LayoutRuleRow {
  return {
    kind: 'part',
    namePattern: '*',
    peerKind: null,
    peerNamePattern: null,
    ...partial,
  }
}

const engine = art('e', 'Engine', 'part', 0, 0)
const wheel = art('w', 'Wheel', 'part', 200, 100)
const body = art('b', 'Body', 'part', 100, 50)
const engineBlock = art('eb', 'EngineBlock', 'part', 50, 50)

describe('matchArtefacts', () => {
  it('matches Eng* to Engine and EngineBlock', () => {
    const ids = matchArtefacts([engine, engineBlock, wheel], 'part', 'Eng*').map(
      (a) => a.id,
    )
    expect(ids.sort()).toEqual(['e', 'eb'])
  })
})

describe('findLayoutConflicts', () => {
  it('flags Engine top + Engine bottom', () => {
    const rules = [
      rule({ id: 'r1', namePattern: 'Engine', placement: 'top' }),
      rule({ id: 'r2', namePattern: 'Engine', placement: 'bottom' }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2'])
    expect(c.message).toBeTruthy()
  })

  it('flags Engine below Wheel + Wheel below Engine', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
      rule({
        id: 'r2',
        namePattern: 'Wheel',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Engine',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2'])
  })

  it('flags horizontal opposites', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'to the right of',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
      rule({
        id: 'r2',
        namePattern: 'Engine',
        placement: 'to the left of',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2'])
  })

  it('flags beside vs below', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'beside',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
      rule({
        id: 'r2',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2'])
  })

  it('flags leftmost + to the right of', () => {
    const rules = [
      rule({ id: 'r1', namePattern: 'Engine', placement: 'leftmost' }),
      rule({
        id: 'r2',
        namePattern: 'Engine',
        placement: 'to the right of',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2'])
  })

  it('marks all rows in a three-cycle', () => {
    const a = art('a', 'A')
    const b = art('b', 'B')
    const c0 = art('c', 'C')
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'A',
        placement: 'above',
        peerKind: 'part',
        peerNamePattern: 'B',
      }),
      rule({
        id: 'r2',
        namePattern: 'B',
        placement: 'above',
        peerKind: 'part',
        peerNamePattern: 'C',
      }),
      rule({
        id: 'r3',
        namePattern: 'C',
        placement: 'above',
        peerKind: 'part',
        peerNamePattern: 'A',
      }),
    ]
    const c = findLayoutConflicts(rules, [a, b, c0])
    expect(c.rowIds.sort()).toEqual(['r1', 'r2', 'r3'])
  })

  it('flags self-contradicting Part * below Part *', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: '*',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: '*',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds).toEqual(['r1'])
  })

  it('returns empty for consistent rules', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
      rule({ id: 'r2', namePattern: 'Body', placement: 'top' }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel, body])
    expect(c.rowIds).toEqual([])
    expect(c.message).toBe('')
  })

  it('marks peer pattern with no matches', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Missing',
      }),
    ]
    const c = findLayoutConflicts(rules, [engine, wheel])
    expect(c.rowIds).toEqual(['r1'])
    expect(c.message).toMatch(/peer/i)
  })
})

describe('solveLayoutRules', () => {
  it('places Engine below Wheel', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const positions = solveLayoutRules([engine, wheel], rules)
    expect(positions.e.y).toBeGreaterThan(positions.w.y + wheel.height)
  })

  it('Body above Wheel and Engine below Wheel keep Body, Wheel, Engine order', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Body',
        placement: 'above',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
      rule({
        id: 'r2',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const positions = solveLayoutRules([body, wheel, engine], rules)
    expect(positions.b.y + body.height).toBeLessThanOrEqual(positions.w.y)
    expect(positions.w.y + wheel.height).toBeLessThanOrEqual(positions.e.y)
  })

  it('Engine below Part * goes under the lowest part peer', () => {
    const p1 = art('p1', 'Alpha', 'part', 0, 0)
    const p2 = art('p2', 'Beta', 'part', 0, 200)
    const eng = art('e', 'Engine', 'part', 0, 50)
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: '*',
      }),
    ]
    const positions = solveLayoutRules([p1, p2, eng], rules)
    // peers are Alpha and Beta; Engine is subject so excluded from peers
    const bottom = Math.max(
      positions.p1.y + p1.height,
      positions.p2.y + p2.height,
    )
    expect(positions.e.y).toBeGreaterThanOrEqual(bottom)
  })

  it('leaves unmatched artefacts at original positions', () => {
    const other = art('o', 'Other', 'part', 333, 444)
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'below',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const positions = solveLayoutRules([engine, wheel, other], rules)
    expect(positions.o).toEqual({ x: 333, y: 444 })
  })

  it('beside places subject to the right of peer, same vertical band', () => {
    const rules = [
      rule({
        id: 'r1',
        namePattern: 'Engine',
        placement: 'beside',
        peerKind: 'part',
        peerNamePattern: 'Wheel',
      }),
    ]
    const positions = solveLayoutRules([engine, wheel], rules)
    expect(positions.e.x).toBeGreaterThan(positions.w.x + wheel.width)
  })
})
