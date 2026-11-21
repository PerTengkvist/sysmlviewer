import type { RealizationMatrixLayout } from '../../../../api'
import type { MatrixCell, MatrixOptions, MatrixRow } from './buildRealizationMatrix'
import { DEFAULT_MATRIX_OPTIONS } from './buildRealizationMatrix'

/** What a click on a cell selects: the `#refine` behind it (the first one), else the use case or step. */
export function cellSelection(row: MatrixRow, cell: MatrixCell): string | null {
  if (!cell.glyph) return null
  return cell.refineId ?? row.id
}

/** The saved choice with defaults filled in. */
export function matrixOptions(saved: RealizationMatrixLayout | null | undefined): MatrixOptions {
  return {
    rows: saved?.rows ?? DEFAULT_MATRIX_OPTIONS.rows,
    columns: saved?.columns ?? DEFAULT_MATRIX_OPTIONS.columns,
  }
}

/** The choice as it is saved in the view's layout: one axis changed, the other kept. */
export function withOption(
  current: MatrixOptions,
  change: Partial<MatrixOptions>,
): RealizationMatrixLayout {
  return { ...current, ...change }
}

export function matrixFileName(viewName: string): string {
  return `${viewName.replace(/[^\w.-]+/g, '_') || 'realization'}-matrix.csv`
}
