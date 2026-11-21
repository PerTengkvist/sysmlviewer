import type {
  Realization,
  RealizationMatrixLayout,
  RealizationPrecision,
  SemanticElement,
  ViewPayload,
} from '../../../../api'
import { labelMap } from '../../labels'

/**
 * Rows, columns and cells of the realization matrix. Everything is read from the view
 * payload (`realization`, `matrixColumns`, `performers`, `semantic`); the realization
 * itself is derived once, in the backend.
 */

export type MatrixOptions = Required<RealizationMatrixLayout>

export const DEFAULT_MATRIX_OPTIONS: MatrixOptions = { rows: 'useCases', columns: 'nodes' }

export type MatrixSource = {
  semantic: Record<string, SemanticElement>
  realization: Realization
  matrixColumns: NonNullable<ViewPayload['matrixColumns']>
}

export type MatrixRow = {
  id: string
  kind: 'useCase' | 'step'
  /** The use case of a step row; its own id for a use case row. */
  useCaseId: string
  label: string
  depth: 0 | 1
  /** Use case: `n/m` realized system steps (`✗` added for a gap in scope). Step: `✓`, `✗` or empty. */
  coverage: string
  gap: boolean
}

export type MatrixColumn = {
  id: string
  label: string
  groupId: string | null
  /** Realizes nothing in the exposed use cases. */
  gap: boolean
}

/** A function header above its function node columns. */
export type MatrixGroup = { id: string | null; label: string; span: number }

export type MatrixCell = {
  glyph: '●' | '○' | ''
  precision: RealizationPrecision | null
  /** An explicit `#refine` to the use case also declares this cell. */
  declared: boolean
  /** Reached only through `include`. */
  viaInclude: boolean
  /** The `#refine` behind the cell (the first one); null when there is none. */
  refineId: string | null
  tooltip: string
}

export type RealizationMatrix = {
  options: MatrixOptions
  rows: MatrixRow[]
  columns: MatrixColumn[]
  groups: MatrixGroup[]
  /** `cells[row][column]`. */
  cells: MatrixCell[][]
}

const EMPTY_CELL: MatrixCell = {
  glyph: '',
  precision: null,
  declared: false,
  viaInclude: false,
  refineId: null,
  tooltip: '',
}

const PRECISION_TEXT: Record<RealizationPrecision, string> = {
  step: 'Realized step by step',
  coarse: 'Realized by a whole function flow',
  explicit: 'Only an explicit #refine links it',
}

function nameOf(semantic: Record<string, SemanticElement>, id: string): string {
  return semantic[id]?.name ?? id.split('::').pop() ?? id
}

export function buildRealizationMatrix(
  source: MatrixSource,
  options: MatrixOptions = DEFAULT_MATRIX_OPTIONS,
): RealizationMatrix {
  const { semantic, realization } = source
  const nodeParts = realization.nodeParts
  const nodes = source.matrixColumns.nodes
  const inScope = new Set(realization.inScope)

  // -- columns
  const byNodes = options.columns === 'nodes'
  const columnIds = byNodes
    ? nodes.map((n) => n.id)
    : [...new Set(nodes.flatMap((n) => nodeParts[n.id] ?? []))]
  const columnLabels = labelMap(
    columnIds.map((id) => ({ id, name: nameOf(semantic, id) })),
    'name',
  )
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  let ordered = columnIds
  const groups: MatrixGroup[] = []
  if (byNodes) {
    const functionIds = [...new Set(nodes.map((n) => n.functionId))]
    ordered = functionIds.flatMap((f) =>
      nodes.filter((n) => n.functionId === f).map((n) => n.id),
    )
    const functionLabels = labelMap(
      functionIds.flatMap((id) => (id ? [{ id, name: nameOf(semantic, id) }] : [])),
      'name',
    )
    for (const f of functionIds) {
      groups.push({
        id: f,
        label: f ? (functionLabels.get(f) ?? '') : '',
        span: nodes.filter((n) => n.functionId === f).length,
      })
    }
  }

  // -- use case cells (also the base of the column coverage)
  const useCaseCell = (uc: string, columnId: string): MatrixCell => {
    const info = realization.useCases[uc]
    if (!info) return EMPTY_CELL
    let precision: RealizationPrecision | undefined = (byNodes ? info.nodes : info.parts)[columnId]
    let refineId: string | null = info.origin[columnId] ?? null
    let declared = info.declared.includes(columnId)
    let throughFunction: string | null = null
    if (!precision) {
      // A function that refines the use case, with no node of its own serving it, stands
      // for its nodes (and their logical parts); the backend says which (`functionNodes`).
      const node = byNodes
        ? columnId in info.functionNodes
          ? columnId
          : undefined
        : Object.keys(info.functionNodes).find((n) => (nodeParts[n] ?? []).includes(columnId))
      const fn = node ? info.functionNodes[node] : undefined
      if (!fn) return EMPTY_CELL
      precision = 'explicit'
      refineId = info.origin[fn] ?? null
      declared = info.declared.includes(fn)
      throughFunction = fn
    }
    const viaInclude = info.viaInclude.includes(throughFunction ?? columnId)
    const text = [PRECISION_TEXT[precision]]
    if (throughFunction) text.push('through its function')
    if (declared && precision !== 'explicit') text.push('an explicit #refine also links it')
    if (viaInclude) text.push('via include')
    return {
      glyph: precision === 'explicit' ? '○' : '●',
      precision,
      declared,
      viaInclude,
      refineId,
      tooltip: text.join(' · '),
    }
  }

  // -- rows
  const useCases = Object.values(semantic).filter(
    (e) => e.kind === 'useCase' && !(e.parentId && semantic[e.parentId]?.kind === 'useCase'),
  )
  const rowLabels = labelMap(useCases, 'label')
  const rows: MatrixRow[] = []
  const cells: MatrixCell[][] = []
  const columnRealizes = new Map<string, boolean>(ordered.map((c) => [c, false]))

  const unrealized = (uc: string, step: string) =>
    !(
      (realization.stepRealizers[step]?.length ?? 0) > 0 ||
      (realization.coarseRealizers[step]?.length ?? 0) > 0 ||
      (realization.coarseRealizers[uc]?.length ?? 0) > 0
    )

  for (const uc of useCases) {
    const system = realization.systemSteps[uc.id] ?? []
    const gaps = system.filter((s) => unrealized(uc.id, s))
    const scoped = inScope.has(uc.id)
    const ucCells = ordered.map((c) => useCaseCell(uc.id, c))
    ordered.forEach((c, i) => {
      if (ucCells[i].glyph) columnRealizes.set(c, true)
    })
    rows.push({
      id: uc.id,
      kind: 'useCase',
      useCaseId: uc.id,
      label: rowLabels.get(uc.id) ?? uc.name,
      depth: 0,
      coverage: system.length ? `${system.length - gaps.length}/${system.length}${scoped && gaps.length ? ' ✗' : ''}` : '',
      gap: scoped && gaps.length > 0,
    })
    cells.push(ucCells)
    if (options.rows !== 'steps') continue
    for (const step of system) {
      const missing = gaps.includes(step)
      rows.push({
        id: step,
        kind: 'step',
        useCaseId: uc.id,
        label: nameOf(semantic, step),
        depth: 1,
        coverage: !missing ? '✓' : scoped ? '✗' : '',
        gap: missing && scoped,
      })
      cells.push(ordered.map((c) => stepCell(step, c)))
    }
  }

  function stepCell(step: string, columnId: string): MatrixCell {
    for (const functionStep of realization.stepRealizers[step] ?? []) {
      const owners = realization.realizerNodes[functionStep] ?? []
      const hit = byNodes
        ? owners.includes(columnId)
        : owners.some((n) => (nodeParts[n] ?? []).includes(columnId))
      if (!hit) continue
      const link = realization.links.find(
        (l) => l.targetId === step && l.sourceId === functionStep,
      )
      return {
        glyph: '●',
        precision: 'step',
        declared: false,
        viaInclude: false,
        refineId: link?.refineId ?? null,
        tooltip: PRECISION_TEXT.step,
      }
    }
    return EMPTY_CELL
  }

  const columns: MatrixColumn[] = ordered.map((id) => ({
    id,
    label: columnLabels.get(id) ?? id,
    groupId: byNodes ? (nodeById.get(id)?.functionId ?? null) : null,
    gap: !columnRealizes.get(id),
  }))
  return { options, rows, columns, groups, cells }
}

function csvField(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The matrix as CSV: the same rows, columns and glyphs as the table. */
export function matrixToCsv(matrix: RealizationMatrix): string {
  const groupLabel = new Map(matrix.groups.map((g) => [g.id, g.label]))
  const header = [
    'Use case',
    'Coverage',
    ...matrix.columns.map((c) => {
      const group = c.groupId ? groupLabel.get(c.groupId) : ''
      return group ? `${group}: ${c.label}` : c.label
    }),
  ]
  const lines = [header.map(csvField).join(',')]
  matrix.rows.forEach((row, r) => {
    const label = `${'  '.repeat(row.depth)}${row.label}`
    lines.push(
      [label, row.coverage, ...matrix.cells[r].map((c) => c.glyph)].map(csvField).join(','),
    )
  })
  lines.push(
    ['Coverage', '', ...matrix.columns.map((c) => (c.gap ? '✗' : ''))].map(csvField).join(','),
  )
  return lines.join('\n')
}
