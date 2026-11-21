import { describe, expect, it } from 'vitest'
import { buildRealizationMatrix, matrixToCsv } from './buildRealizationMatrix'
import {
  AUTH, BC, DRIVE, IMMO, LOCK, LOCKS, REFINE_1, REFINE_2, REFINE_4, SEC, START, UNLOCK, VC,
  el, probeView,
} from './realizationFixture'

const nodesByUc = { rows: 'useCases', columns: 'nodes' } as const
const stepsByNodes = { rows: 'steps', columns: 'nodes' } as const
const ucByParts = { rows: 'useCases', columns: 'parts' } as const

const cell = (m: ReturnType<typeof buildRealizationMatrix>, row: string, col: string) => {
  const r = m.rows.findIndex((x) => x.id === row)
  const c = m.columns.findIndex((x) => x.id === col)
  expect(r, `row ${row}`).toBeGreaterThanOrEqual(0)
  expect(c, `column ${col}`).toBeGreaterThanOrEqual(0)
  return m.cells[r][c]
}

describe('rows', () => {
  it('lists the use cases in exposed order, tag first', () => {
    const m = buildRealizationMatrix(probeView(), nodesByUc)
    expect(m.rows.map((r) => r.label)).toEqual(['UCA Start', 'UCB Unlock', 'UCC Lock', 'UCD Drive'])
    expect(m.rows.every((r) => r.kind === 'useCase' && r.depth === 0)).toBe(true)
  })

  it('puts the system steps under their use case in steps mode, without actor steps', () => {
    const m = buildRealizationMatrix(probeView(), stepsByNodes)
    expect(m.rows.map((r) => `${r.depth}:${r.label}`)).toEqual([
      '0:UCA Start', '1:checkKey', '1:showReady', '1:askForBrake',
      '0:UCB Unlock', '1:unlockDoors',
      '0:UCC Lock', '1:lockDoors',
      '0:UCD Drive',
    ])
    expect(m.rows.filter((r) => r.kind === 'step').every((r) => r.useCaseId !== r.id)).toBe(true)
  })

  it('qualifies colliding names', () => {
    const view = probeView()
    view.semantic['Other::UC::Start'] = el('Other::UC::Start', 'useCase', 'Other::UC')
    view.semantic[START] = { ...view.semantic[START], shortId: null }
    const m = buildRealizationMatrix(view, nodesByUc)
    const labels = m.rows.map((r) => r.label)
    expect(labels).toContain('Other::UC::Start')
    expect(labels).toContain('RealizationProbe::UC::Start')
  })
})

describe('columns', () => {
  it('groups function nodes under their function in two header rows', () => {
    const m = buildRealizationMatrix(probeView(), nodesByUc)
    expect(m.columns.map((c) => c.label)).toEqual(['auth', 'immo', 'locks'])
    expect(m.groups).toEqual([{ id: SEC, label: 'Security', span: 3 }])
  })

  it('keeps every function node of the model, also unlinked ones', () => {
    const view = probeView()
    view.matrixColumns.nodes.push({ id: 'X::f::lonely', functionId: 'X::f', partIds: [] })
    view.semantic['X::f'] = el('X::f', 'part')
    view.semantic['X::f::lonely'] = el('X::f::lonely', 'part', 'X::f')
    const m = buildRealizationMatrix(view, nodesByUc)
    expect(m.columns.map((c) => c.id)).toContain('X::f::lonely')
    expect(m.groups.map((g) => g.label)).toEqual(['Security', 'f'])
  })

  it('groups nodes that no function owns under an empty group', () => {
    const view = probeView()
    view.matrixColumns.nodes.push({ id: 'X::free', functionId: null, partIds: [] })
    view.semantic['X::free'] = el('X::free', 'part')
    const m = buildRealizationMatrix(view, nodesByUc)
    expect(m.groups.at(-1)).toEqual({ id: null, label: '', span: 1 })
  })

  it('lists the logical parts in parts mode, without groups', () => {
    const m = buildRealizationMatrix(probeView(), ucByParts)
    expect(m.columns.map((c) => c.label)).toEqual(['vc', 'bc'])
    expect(m.groups).toEqual([])
  })
})

describe('cells', () => {
  const m = buildRealizationMatrix(probeView(), nodesByUc)

  it('marks a derived link with a filled dot', () => {
    expect(cell(m, START, AUTH)).toMatchObject({ glyph: '●', precision: 'step', refineId: REFINE_1 })
    expect(cell(m, START, IMMO)).toMatchObject({ glyph: '●', refineId: REFINE_2 })
    expect(cell(m, UNLOCK, LOCKS)).toMatchObject({ glyph: '●', precision: 'coarse' })
  })

  it('leaves a cell without a link empty', () => {
    expect(cell(m, START, LOCKS)).toMatchObject({ glyph: '', precision: null, refineId: null })
  })

  it('marks a bare explicit link with a ring on the nodes of the function', () => {
    for (const node of [AUTH, IMMO, LOCKS]) {
      expect(cell(m, LOCK, node)).toMatchObject({
        glyph: '○', precision: 'explicit', declared: true, refineId: REFINE_4,
      })
    }
  })

  it('keeps the dot and says in the tooltip that an explicit link also exists', () => {
    const view = probeView()
    view.realization.useCases[START].declared = [AUTH]
    const c = cell(buildRealizationMatrix(view, nodesByUc), START, AUTH)
    expect(c).toMatchObject({ glyph: '●', declared: true })
    expect(c.tooltip).toMatch(/explicit/i)
    expect(cell(m, START, IMMO).tooltip).not.toMatch(/explicit/i)
  })

  it('marks cells reached only through include', () => {
    expect(cell(m, DRIVE, AUTH)).toMatchObject({ glyph: '●', viaInclude: true, refineId: null })
    expect(cell(m, DRIVE, AUTH).tooltip).toMatch(/include/i)
    expect(cell(m, START, AUTH).viaInclude).toBe(false)
  })

  it('shows a link in the parts columns too', () => {
    const p = buildRealizationMatrix(probeView(), ucByParts)
    expect(cell(p, START, VC)).toMatchObject({ glyph: '●', precision: 'step' })
    expect(cell(p, UNLOCK, BC)).toMatchObject({ glyph: '●', precision: 'coarse' })
    expect(cell(p, LOCK, BC)).toMatchObject({ glyph: '○' })
    expect(cell(p, START, BC).glyph).toBe('')
  })

  it('gives only step precision a dot on step rows; a coarse link shows on the use case row', () => {
    const s = buildRealizationMatrix(probeView(), stepsByNodes)
    const checkKey = `${START}::checkKey`
    expect(cell(s, checkKey, AUTH)).toMatchObject({ glyph: '●', precision: 'step', refineId: REFINE_1 })
    expect(cell(s, checkKey, IMMO).glyph).toBe('')
    expect(cell(s, `${START}::showReady`, IMMO)).toMatchObject({ glyph: '●', refineId: REFINE_2 })
    expect(cell(s, `${START}::askForBrake`, AUTH).glyph).toBe('')
    expect(cell(s, `${UNLOCK}::unlockDoors`, LOCKS).glyph).toBe('')
    expect(cell(s, UNLOCK, LOCKS).glyph).toBe('●')
  })
})

describe('coverage', () => {
  it('counts realized system steps per use case and flags gaps in scope', () => {
    const m = buildRealizationMatrix(probeView(), nodesByUc)
    const row = (id: string) => m.rows.find((r) => r.id === id)!
    expect(row(START)).toMatchObject({ coverage: '2/3 ✗', gap: true })
    expect(row(UNLOCK)).toMatchObject({ coverage: '1/1', gap: false }) // coarse link covers it
    expect(row(LOCK)).toMatchObject({ coverage: '0/1', gap: false }) // not in scope: no flag
    expect(row(DRIVE)).toMatchObject({ coverage: '', gap: false }) // no system steps
  })

  it('marks the unrealized system step', () => {
    const m = buildRealizationMatrix(probeView(), stepsByNodes)
    const row = (id: string) => m.rows.find((r) => r.id === id)!
    expect(row(`${START}::askForBrake`)).toMatchObject({ coverage: '✗', gap: true })
    expect(row(`${START}::checkKey`)).toMatchObject({ coverage: '✓', gap: false })
  })

  it('flags a column that realizes nothing in the exposed use cases', () => {
    const view = probeView()
    view.matrixColumns.nodes.push({ id: 'X::f::lonely', functionId: 'X::f', partIds: ['X::p'] })
    view.semantic['X::f::lonely'] = el('X::f::lonely', 'part', 'X::f')
    view.semantic['X::f'] = el('X::f', 'part')
    view.semantic['X::p'] = el('X::p', 'part')
    const nodes = buildRealizationMatrix(view, nodesByUc)
    expect(nodes.columns.map((c) => [c.id, c.gap])).toEqual([
      [AUTH, false], [IMMO, false], [LOCKS, false], ['X::f::lonely', true],
    ])
    const parts = buildRealizationMatrix(view, ucByParts)
    expect(parts.columns.map((c) => [c.id, c.gap])).toEqual([
      [VC, false], [BC, false], ['X::p', true],
    ])
  })

  it('counts an explicit-only link as realizing', () => {
    const view = probeView()
    delete view.realization.useCases[START]
    delete view.realization.useCases[UNLOCK]
    delete view.realization.useCases[DRIVE]
    const m = buildRealizationMatrix(view, nodesByUc)
    expect(m.columns.every((c) => c.gap)).toBe(false) // Lock's function Security covers its nodes
  })
})

describe('matrixToCsv', () => {
  it('writes the same cells as the table', () => {
    const csv = matrixToCsv(buildRealizationMatrix(probeView(), nodesByUc))
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Use case,Coverage,Security: auth,Security: immo,Security: locks')
    expect(lines[1]).toBe('UCA Start,2/3 ✗,●,●,')
    expect(lines[3]).toBe('UCC Lock,0/1,○,○,○')
    expect(lines.at(-1)).toBe('Coverage,,,,')
  })

  it('quotes fields with commas and quotes', () => {
    const view = probeView()
    view.semantic[START] = { ...view.semantic[START], name: 'A, "B"', shortId: null }
    const csv = matrixToCsv(buildRealizationMatrix(view, nodesByUc))
    expect(csv).toContain('"A, ""B""",')
  })
})
