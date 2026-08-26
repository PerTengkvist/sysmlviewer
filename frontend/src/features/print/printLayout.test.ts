import { describe, expect, it } from 'vitest'
import {
  buildPrintPages,
  clearAllSelections,
  defaultPrintSelection,
  selectAllDiagrams,
  type PrintDiagramRef,
  type PrintMode,
} from './printLayout'
import type { ProjectSheet } from '../sheet/sheet'

const diagrams: PrintDiagramRef[] = [
  { id: 'v1', name: 'View A', widthPx: 400, heightPx: 300 },
  { id: 'v2', name: 'View B', widthPx: 400, heightPx: 300 },
  { id: 'v3', name: 'View C', widthPx: 800, heightPx: 600 },
]

describe('print selection', () => {
  it('defaults to only the active view selected', () => {
    const sel = defaultPrintSelection(diagrams, 'v2')
    expect(sel).toEqual({ v1: false, v2: true, v3: false })
  })

  it('selectAll and clearAll', () => {
    expect(selectAllDiagrams(diagrams)).toEqual({
      v1: true,
      v2: true,
      v3: true,
    })
    expect(clearAllSelections(diagrams)).toEqual({
      v1: false,
      v2: false,
      v3: false,
    })
  })
})

describe('buildPrintPages', () => {
  const sheet: ProjectSheet = {
    titleBlock: {
      title: 'T',
      createdBy: 'A',
      editedBy: 'B',
      version: '1',
      lastUpdated: '2026',
      drawingId: 'D',
      position: 'bottom-right',
    },
    frame: { paper: 'A4', orientation: 'landscape', visible: false },
  }

  it('separatePages yields one page per selected diagram', () => {
    const pages = buildPrintPages({
      diagrams,
      selected: { v1: true, v2: true, v3: false },
      mode: 'separatePages',
      sheet,
    })
    expect(pages).toHaveLength(2)
    expect(pages[0].diagrams.map((d) => d.id)).toEqual(['v1'])
    expect(pages[0].showFrame).toBe(true)
    expect(pages[0].showTitleBlock).toBe(true)
  })

  it('selectedOnOnePage packs all selected on a single page', () => {
    const pages = buildPrintPages({
      diagrams,
      selected: { v1: true, v2: true, v3: true },
      mode: 'selectedOnOnePage',
      sheet,
    })
    expect(pages).toHaveLength(1)
    expect(pages[0].diagrams).toHaveLength(3)
  })

  it('saveSpace packs small diagrams when they fit', () => {
    const pages = buildPrintPages({
      diagrams: [
        { id: 'a', name: 'A', widthPx: 100, heightPx: 80 },
        { id: 'b', name: 'B', widthPx: 100, heightPx: 80 },
      ],
      selected: { a: true, b: true },
      mode: 'saveSpace',
      sheet: {
        titleBlock: null,
        frame: { paper: 'A4', orientation: 'landscape', visible: true },
      },
    })
    expect(pages.length).toBeGreaterThanOrEqual(1)
    expect(pages.flatMap((p) => p.diagrams).map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('uses A4 landscape when frame is null', () => {
    const pages = buildPrintPages({
      diagrams: [diagrams[0]],
      selected: { v1: true },
      mode: 'separatePages' as PrintMode,
      sheet: { titleBlock: null, frame: null },
    })
    expect(pages[0].widthMm).toBe(297)
    expect(pages[0].heightMm).toBe(210)
    expect(pages[0].showFrame).toBe(false)
  })
})
