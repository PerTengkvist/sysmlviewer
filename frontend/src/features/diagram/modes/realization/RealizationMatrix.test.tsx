import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildRealizationMatrix } from './buildRealizationMatrix'
import { RealizationMatrix } from './RealizationMatrix'
import { cellSelection, matrixFileName, matrixOptions, withOption } from './matrixSelection'
import { AUTH, LOCK, LOCKS, REFINE_1, START, probeView } from './realizationFixture'

const noop = () => {}

function render(
  options = matrixOptions(null),
  selectedIds: string[] = [],
) {
  return renderToStaticMarkup(
    createElement(RealizationMatrix, {
      matrix: buildRealizationMatrix(probeView(), options),
      selectedIds,
      onSelect: noop,
      onOptionsChange: noop,
      onExport: noop,
    }),
  )
}

describe('RealizationMatrix', () => {
  it('renders a grid with sticky row and column headers', () => {
    const html = render()
    expect(html).toContain('role="grid"')
    expect(html).toContain('class="realization-matrix"')
    expect(html.match(/<th[^>]*scope="row"/g)?.length).toBe(5) // four use cases and the coverage row
    expect(html).toContain('data-row-id="' + START + '"')
    expect(html).toContain('data-column-id="' + AUTH + '"')
    expect(html).toContain('realization-sticky-column')
    expect(html).toContain('realization-sticky-row')
  })

  it('shows the function headers above the function node headers', () => {
    const html = render()
    expect(html).toMatch(/<th[^>]*colSpan="3"[^>]*>Security<\/th>/)
    expect(html).toContain('>auth<')
  })

  it('draws the glyphs and the coverage', () => {
    const html = render()
    expect(html).toMatch(new RegExp(`data-row-id="${START}"[\\s\\S]*?2/3 ✗`))
    expect(html).toContain('realization-gap')
    expect(html).toContain('●')
    expect(html).toContain('○')
  })

  it('marks the active toggles and has the four switch buttons', () => {
    const html = render({ rows: 'steps', columns: 'parts' })
    expect(html).toMatch(/aria-pressed="true"[^>]*>Steps</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Use cases</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Logical parts</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Function nodes</)
    expect(html).toContain('data-row-kind="step"')
  })

  it('marks the selected row and column', () => {
    const html = render(matrixOptions(null), [START, AUTH])
    expect(html).toMatch(new RegExp(`realization-row selected"[^>]*data-row-id="${START}"`))
    expect(html).toMatch(new RegExp(`selected"[^>]*data-column-id="${AUTH}"`))
    expect(html).toContain('realization-export')
  })
})

describe('findings', () => {
  it('lists the findings below the grid', () => {
    const view = probeView()
    view.realization.findings.push({
      code: 'refine-without-step',
      elementId: 'RealizationProbe::F::Security',
      message: 'function refines Start without steps', useCaseId: null,
    })
    const html = renderToStaticMarkup(
      createElement(RealizationMatrix, {
        matrix: buildRealizationMatrix(view, matrixOptions(null)),
        selectedIds: [],
        onSelect: noop,
        onOptionsChange: noop,
        onExport: noop,
      }),
    )
    expect(html).toContain('data-finding-code="refine-without-step"')
    expect(html).toContain('function refines Start without steps')
    expect(render()).not.toContain('realization-findings')
  })
})

describe('selection and options', () => {
  const matrix = buildRealizationMatrix(probeView(), matrixOptions(null))
  const row = (id: string) => matrix.rows.find((r) => r.id === id)!
  const cellOf = (r: string, c: string) =>
    matrix.cells[matrix.rows.findIndex((x) => x.id === r)][matrix.columns.findIndex((x) => x.id === c)]

  it('selects the refine link behind a cell', () => {
    expect(cellSelection(row(START), cellOf(START, AUTH))).toBe(REFINE_1)
    expect(cellSelection(row(LOCK), cellOf(LOCK, AUTH))).not.toBeNull()
  })

  it('falls back to the row when no link is behind the cell, and ignores empty cells', () => {
    const drive = matrix.rows.find((r) => r.label.endsWith('Drive'))!
    const cell = matrix.cells[matrix.rows.indexOf(drive)][0]
    expect(cell.refineId).toBeNull()
    expect(cellSelection(drive, cell)).toBe(drive.id)
    expect(cellSelection(row(START), cellOf(START, LOCKS))).toBeNull()
  })

  it('keeps the other axis when one changes', () => {
    expect(withOption(matrixOptions({ columns: 'parts' }), { rows: 'steps' })).toEqual({
      rows: 'steps',
      columns: 'parts',
    })
    expect(matrixOptions(null)).toEqual({ rows: 'useCases', columns: 'nodes' })
  })

  it('names the CSV file after the view', () => {
    expect(matrixFileName('My View')).toBe('My_View-matrix.csv')
  })
})
