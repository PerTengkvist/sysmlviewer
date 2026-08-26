import { paperSizeMm, type ProjectSheet } from '../sheet/sheet'

import type { ViewPayload } from '../../api'

export type PrintMode = 'separatePages' | 'saveSpace' | 'selectedOnOnePage'

export type PrintDiagramRef = {
  id: string
  name: string
  widthPx: number
  heightPx: number
}

/** Diagram slot enriched with fetched view data before printing. */
export type PrintDiagramSlot = PrintDiagramRef & {
  viewPayload?: ViewPayload
  documentation?: string | null
}

export type PrintSelection = Record<string, boolean>

export type PrintPage = {
  diagrams: PrintDiagramSlot[]
  widthMm: number
  heightMm: number
  showFrame: boolean
  showTitleBlock: boolean
}

export type PrintBuildOptions = {
  diagrams: PrintDiagramRef[]
  selected: PrintSelection
  mode: PrintMode
  sheet: import('../sheet/sheet').ProjectSheet
  includeDescriptions: boolean
}

const DEFAULT_PAGE = { widthMm: 297, heightMm: 210 } // A4 landscape

export function defaultPrintSelection(
  diagrams: PrintDiagramRef[],
  activeViewId: string | null,
): PrintSelection {
  const sel: PrintSelection = {}
  for (const d of diagrams) {
    sel[d.id] = activeViewId != null && d.id === activeViewId
  }
  return sel
}

export function selectAllDiagrams(diagrams: PrintDiagramRef[]): PrintSelection {
  return Object.fromEntries(diagrams.map((d) => [d.id, true]))
}

export function clearAllSelections(diagrams: PrintDiagramRef[]): PrintSelection {
  return Object.fromEntries(diagrams.map((d) => [d.id, false]))
}

function pageSize(sheet: ProjectSheet): { widthMm: number; heightMm: number } {
  if (sheet.frame) return paperSizeMm(sheet.frame)
  return DEFAULT_PAGE
}

/** Rough fit: diagram px mapped at 96dpi ≈ 25.4mm/inch; leave margin. */
function fitsOnPage(
  items: PrintDiagramRef[],
  page: { widthMm: number; heightMm: number },
): boolean {
  const margin = 20
  const usableW = page.widthMm - margin * 2
  const usableH = page.heightMm - margin * 2
  const gap = 8
  let x = 0
  let y = 0
  let rowH = 0
  const pxToMm = 25.4 / 96
  for (const d of items) {
    const w = d.widthPx * pxToMm
    const h = d.heightPx * pxToMm
    if (w > usableW || h > usableH) return items.length === 1
    if (x + w > usableW) {
      x = 0
      y += rowH + gap
      rowH = 0
    }
    if (y + h > usableH) return false
    x += w + gap
    rowH = Math.max(rowH, h)
  }
  return true
}

export function buildPrintPages(options: {
  diagrams: PrintDiagramRef[]
  selected: PrintSelection
  mode: PrintMode
  sheet: ProjectSheet
}): PrintPage[] {
  const chosen = options.diagrams.filter((d) => options.selected[d.id])
  const size = pageSize(options.sheet)
  const showFrame = options.sheet.frame != null
  const showTitleBlock = options.sheet.titleBlock != null
  const base = { ...size, showFrame, showTitleBlock }

  if (!chosen.length) return []

  if (options.mode === 'separatePages') {
    return chosen.map((d) => ({ ...base, diagrams: [d] }))
  }

  if (options.mode === 'selectedOnOnePage') {
    return [{ ...base, diagrams: chosen }]
  }

  // saveSpace: pack greedily onto pages
  const pages: PrintPage[] = []
  let current: PrintDiagramRef[] = []
  for (const d of chosen) {
    const trial = [...current, d]
    if (current.length && !fitsOnPage(trial, size)) {
      pages.push({ ...base, diagrams: current })
      current = [d]
    } else {
      current = trial
    }
  }
  if (current.length) pages.push({ ...base, diagrams: current })
  return pages
}
