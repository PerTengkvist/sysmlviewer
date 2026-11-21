import type { MouseEvent } from 'react'
import type { RealizationMatrix as Matrix, MatrixOptions } from './buildRealizationMatrix'
import { matrixToCsv } from './buildRealizationMatrix'
import { cellSelection, withOption } from './matrixSelection'
import type { RealizationMatrixLayout } from '../../../../api'

type Props = {
  matrix: Matrix
  selectedIds: readonly string[]
  onSelect: (id: string, opts: { shift: boolean }) => void
  /** The user changed what rows or columns list; the choice is saved with the view. */
  onOptionsChange: (layout: RealizationMatrixLayout) => void
  /** Export the table: gets the CSV text. */
  onExport: (text: string) => void
}

function Toggle<T extends string>({
  label,
  value,
  current,
  onPick,
}: {
  label: string
  value: T
  current: T
  onPick: (value: T) => void
}) {
  return (
    <button
      type="button"
      className={current === value ? 'active' : ''}
      aria-pressed={current === value}
      onClick={() => onPick(value)}
    >
      {label}
    </button>
  )
}

/** The toolbar buttons: rows switch, columns switch and CSV export. */
export function RealizationMatrixControls({
  options,
  onOptionsChange,
  onExport,
  text,
}: {
  options: MatrixOptions
  onOptionsChange: Props['onOptionsChange']
  onExport: Props['onExport']
  text: () => string
}) {
  return (
    <div className="realization-controls">
      <Toggle label="Use cases" value="useCases" current={options.rows} onPick={(rows) => onOptionsChange(withOption(options, { rows }))} />
      <Toggle label="Steps" value="steps" current={options.rows} onPick={(rows) => onOptionsChange(withOption(options, { rows }))} />
      <span className="realization-controls-gap" />
      <Toggle label="Function nodes" value="nodes" current={options.columns} onPick={(columns) => onOptionsChange(withOption(options, { columns }))} />
      <Toggle label="Logical parts" value="parts" current={options.columns} onPick={(columns) => onOptionsChange(withOption(options, { columns }))} />
      <button type="button" className="realization-export" onClick={() => onExport(text())}>
        Export CSV
      </button>
    </div>
  )
}

/**
 * The `realizationMatrix` diagram mode: use cases (or their steps) against function
 * nodes (or logical parts). `●` derived link, `○` only an explicit `#refine`.
 */
export function RealizationMatrix({
  matrix,
  selectedIds,
  onSelect,
  onOptionsChange,
  onExport,
}: Props) {
  const pick = (id: string) => (e: MouseEvent) => onSelect(id, { shift: e.shiftKey })
  const grouped = matrix.groups.length > 0
  return (
    <div className="realization-matrix-wrap">
      <RealizationMatrixControls
        options={matrix.options}
        onOptionsChange={onOptionsChange}
        onExport={onExport}
        text={() => matrixToCsv(matrix)}
      />
      <table className="realization-matrix" role="grid">
        <thead>
          {grouped && (
            <tr>
              <th className="realization-sticky-column realization-sticky-row" scope="col" rowSpan={2}>
                Use case
              </th>
              <th className="realization-sticky-row realization-coverage-head" scope="col" rowSpan={2}>
                Coverage
              </th>
              {matrix.groups.map((g) => (
                <th
                  key={g.id ?? ''}
                  className="realization-sticky-row realization-group"
                  scope="colgroup"
                  colSpan={g.span}
                  data-group-id={g.id ?? ''}
                  onClick={g.id ? pick(g.id) : undefined}
                >
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {!grouped && (
              <>
                <th className="realization-sticky-column realization-sticky-row" scope="col">
                  Use case
                </th>
                <th className="realization-sticky-row realization-coverage-head" scope="col">
                  Coverage
                </th>
              </>
            )}
            {matrix.columns.map((c) => (
              <th
                key={c.id}
                className={`realization-sticky-row realization-column-head${selectedIds.includes(c.id) ? ' selected' : ''}`}
                scope="col"
                data-column-id={c.id}
                onClick={pick(c.id)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, r) => (
            <tr
              key={row.id}
              className={`realization-row${selectedIds.includes(row.id) ? ' selected' : ''}`}
              data-row-id={row.id}
              data-row-kind={row.kind}
            >
              <th
                className="realization-sticky-column"
                scope="row"
                style={{ paddingLeft: 8 + row.depth * 16 }}
                onClick={pick(row.id)}
              >
                {row.label}
              </th>
              <td className={`realization-coverage${row.gap ? ' realization-gap' : ''}`}>
                {row.coverage}
              </td>
              {matrix.columns.map((c, i) => {
                const cell = matrix.cells[r][i]
                const target = cellSelection(row, cell)
                return (
                  <td
                    key={c.id}
                    className={`realization-cell${cell.glyph ? ' linked' : ''}${cell.viaInclude ? ' via-include' : ''}`}
                    data-column-id={c.id}
                    data-precision={cell.precision ?? undefined}
                    data-refine-id={cell.refineId ?? undefined}
                    title={cell.tooltip || undefined}
                    onClick={target ? pick(target) : undefined}
                  >
                    {cell.glyph}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="realization-sticky-column" scope="row">
              Coverage
            </th>
            <td />
            {matrix.columns.map((c) => (
              <td
                key={c.id}
                className={`realization-coverage${c.gap ? ' realization-gap' : ''}`}
                title={c.gap ? 'Realizes nothing in the use cases of this view' : undefined}
              >
                {c.gap ? '✗' : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
