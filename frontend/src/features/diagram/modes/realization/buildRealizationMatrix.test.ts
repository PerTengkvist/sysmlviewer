import { describe, expect, it } from 'vitest'
import { elementRealization } from '../../../details/realizationLinks'
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
})

describe('columns', () => {
  it('groups function nodes under their function in two header rows', () => {
    const m = buildRealizationMatrix(probeView(), nodesByUc)
    expect(m.columns.map((c) => c.label)).toEqual(['auth', 'immo', 'locks'])
    expect(m.groups).toEqual([{ id: SEC, label: 'Security', span: 3 }])
  })

  it('keeps every function node of the model, also unlinked ones', () => {
    const view = probeView()
    view.matrixColumns.nodes.push({ id: 'X::f::lonely', functionId: 'X::f' })
    view.semantic['X::f'] = el('X::f', 'part')
    view.semantic['X::f::lonely'] = el('X::f::lonely', 'part', 'X::f')
    const m = buildRealizationMatrix(view, nodesByUc)
    expect(m.columns.map((c) => c.id)).toContain('X::f::lonely')
    expect(m.groups.map((g) => g.label)).toEqual(['Security', 'f'])
  })

  it('groups nodes that no function owns under an empty group', () => {
    const view = probeView()
    view.matrixColumns.nodes.push({ id: 'X::free', functionId: null })
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

  it('marks a ring that comes through include on the nodes of the function', () => {
    const view = probeView()
    view.realization.useCases[DRIVE].viaInclude = [SEC]
    view.realization.useCases[DRIVE].nodes = {}
    view.realization.useCases[DRIVE].functionNodes = { [AUTH]: SEC }
    const c = cell(buildRealizationMatrix(view, nodesByUc), DRIVE, AUTH)
    expect(c).toMatchObject({ glyph: '○', viaInclude: true })
    expect(c.tooltip).toMatch(/include/i)
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
    view.matrixColumns.nodes.push({ id: 'X::f::lonely', functionId: 'X::f' })
    view.realization.nodeParts['X::f::lonely'] = ['X::p']
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

  it('shows no ring on the nodes of a function when one of them serves the use case itself', () => {
    // The electric car form: the function and its node both refine the use case.
    const view = probeView()
    const lock = view.realization.useCases[LOCK]
    lock.nodes = { [AUTH]: 'explicit' }
    lock.declared = [SEC, AUTH]
    lock.functionNodes = {}
    for (const uc of [START, UNLOCK, DRIVE]) delete view.realization.useCases[uc]
    const m = buildRealizationMatrix(view, nodesByUc)
    expect(cell(m, LOCK, AUTH).glyph).toBe('○')
    expect(cell(m, LOCK, IMMO).glyph).toBe('')
    expect(cell(m, LOCK, LOCKS).glyph).toBe('')
    expect(m.columns.map((c) => [c.id, c.gap])).toEqual([[AUTH, false], [IMMO, true], [LOCKS, true]])
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

describe('findings', () => {
  it('lists the findings that the grid does not show as a mark', () => {
    const view = probeView()
    view.realization.findings.push(
      { code: 'refine-without-step', elementId: SEC, message: 'function refines Start without steps', useCaseId: null },
      { code: 'bad-realization-end', elementId: 'P::dep', message: 'not a realization', useCaseId: null },
    )
    const m = buildRealizationMatrix(view, nodesByUc)
    // The unrealized system step is the ✗ of the grid; the others are listed.
    expect(m.findings.map((f) => [f.code, f.elementId])).toEqual([
      ['refine-without-step', SEC],
      ['bad-realization-end', 'P::dep'],
    ])
    expect(m.findings[0].label).toBe('Security')
  })
})

describe('matrixToCsv', () => {
  it('writes the same cells as the table', () => {
    const csv = matrixToCsv(buildRealizationMatrix(probeView(), nodesByUc))
    const lines = csv.replace('\uFEFF', '').split('\n')
    expect(lines[0]).toBe('Use case,Coverage,Security: auth,Security: immo,Security: locks')
    expect(lines[1]).toBe('UCA Start,2/3 ✗,●,●,')
    expect(lines[3]).toBe('UCC Lock,0/1,○,○,○')
    expect(lines.at(-1)).toBe('Coverage,,,,')
  })

  it('starts with a byte order mark so that Excel reads the glyphs', () => {
    expect(matrixToCsv(buildRealizationMatrix(probeView(), nodesByUc)).startsWith('\uFEFF')).toBe(true)
  })

  it('quotes carriage returns', () => {
    const view = probeView()
    view.matrixLabels.rows[START] = 'A\rB'
    expect(matrixToCsv(buildRealizationMatrix(view, nodesByUc))).toContain('"A\rB",')
  })

  it('neutralizes fields that a spreadsheet would run as a formula', () => {
    const view = probeView()
    for (const [name, shown] of [['=SUM(A1)', "'=SUM(A1)"], ['+1', "'+1"], ['-x', "'-x"], ['@x', "'@x"]]) {
      view.matrixLabels.rows[START] = name
      const lines = matrixToCsv(buildRealizationMatrix(view, nodesByUc)).split('\n')
      expect(lines[1].startsWith(shown + ',')).toBe(true)
    }
  })

  it('quotes fields with commas and quotes', () => {
    const view = probeView()
    view.matrixLabels.rows[START] = 'A, "B"'
    const csv = matrixToCsv(buildRealizationMatrix(view, nodesByUc))
    expect(csv).toContain('"A, ""B""",')
  })
})

describe('agreement with Details', () => {
  const agree = (options: typeof nodesByUc | typeof ucByParts, key: 'realizes' | 'realizesViaNode') => {
    const view = probeView()
    const m = buildRealizationMatrix(view, options)
    for (const [r, row] of m.rows.entries()) {
      for (const [c, column] of m.columns.entries()) {
        const cell = m.cells[r][c]
        const info = elementRealization(view.realization, view.semantic, column.id)
        const hit = info[key].find((e) => e.useCaseId === row.id)
        const at = `${row.id} / ${column.id}`
        // The matrix and Details read the same fields, so every cell has a counterpart.
        expect(hit?.precision ?? null, at).toBe(cell.precision)
        expect(hit?.throughFunction ?? false, at).toBe(cell.tooltip.includes('through its function'))
        expect(hit?.viaInclude ?? false, at).toBe(cell.viaInclude)
      }
    }
  }

  it('says the same about every use case / function node pair', () => agree(nodesByUc, 'realizes'))
  it('says the same about every use case / logical part pair', () => agree(ucByParts, 'realizesViaNode'))
})

describe('findings', () => {
  it('lists the findings that the grid does not show as a mark', () => {
    const view = probeView()
    view.realization.findings.push(
      { code: 'refine-without-step', elementId: SEC, message: 'function refines Start without steps', useCaseId: null },
      { code: 'bad-realization-end', elementId: 'P::dep', message: 'not a realization', useCaseId: null },
    )
    const m = buildRealizationMatrix(view, nodesByUc)
    // The unrealized system step is the ✗ of the grid; the others are listed.
    expect(m.findings.map((f) => [f.code, f.elementId])).toEqual([
      ['refine-without-step', SEC],
      ['bad-realization-end', 'P::dep'],
    ])
    expect(m.findings[0].label).toBe('Security')
  })
})

describe('matrixToCsv', () => {
  it('writes the same cells as the table', () => {
    const csv = matrixToCsv(buildRealizationMatrix(probeView(), nodesByUc))
    const lines = csv.replace('\uFEFF', '').split('\n')
    expect(lines[0]).toBe('Use case,Coverage,Security: auth,Security: immo,Security: locks')
    expect(lines[1]).toBe('UCA Start,2/3 ✗,●,●,')
    expect(lines[3]).toBe('UCC Lock,0/1,○,○,○')
    expect(lines.at(-1)).toBe('Coverage,,,,')
  })

  it('starts with a byte order mark so that Excel reads the glyphs', () => {
    expect(matrixToCsv(buildRealizationMatrix(probeView(), nodesByUc)).startsWith('\uFEFF')).toBe(true)
  })

  it('quotes carriage returns', () => {
    const view = probeView()
    view.matrixLabels.rows[START] = 'A\rB'
    expect(matrixToCsv(buildRealizationMatrix(view, nodesByUc))).toContain('"A\rB",')
  })

  it('neutralizes fields that a spreadsheet would run as a formula', () => {
    const view = probeView()
    for (const [name, shown] of [['=SUM(A1)', "'=SUM(A1)"], ['+1', "'+1"], ['-x', "'-x"], ['@x', "'@x"]]) {
      view.matrixLabels.rows[START] = name
      const lines = matrixToCsv(buildRealizationMatrix(view, nodesByUc)).split('\n')
      expect(lines[1].startsWith(shown + ',')).toBe(true)
    }
  })

  it('quotes fields with commas and quotes', () => {
    const view = probeView()
    view.matrixLabels.rows[START] = 'A, "B"'
    const csv = matrixToCsv(buildRealizationMatrix(view, nodesByUc))
    expect(csv).toContain('"A, ""B""",')
  })
})

describe('agreement with Details', () => {
  it('says the same as the Details panel about every use case / node pair', () => {
    const view = probeView()
    const m = buildRealizationMatrix(view, nodesByUc)
    for (const [r, row] of m.rows.entries()) {
      for (const [c, column] of m.columns.entries()) {
        const cell = m.cells[r][c]
        const node = elementRealization(view.realization, view.semantic, column.id)
        const hit = node.realizes.find((e) => e.useCaseId === row.id)
        // The matrix and Details read the same fields, so every cell has a counterpart.
        expect(hit?.precision ?? null, `${row.id} / ${column.id}`).toBe(cell.precision)
        expect(hit?.throughFunction ?? false, `${row.id} / ${column.id}`).toBe(
          cell.tooltip.includes('through its function'),
        )
        expect(hit?.viaInclude ?? false, `${row.id} / ${column.id}`).toBe(cell.viaInclude)
      }
    }
  })
})
