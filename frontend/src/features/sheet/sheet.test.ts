import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHEET,
  PAPER_SIZES_MM,
  TITLE_BLOCK_POSITIONS,
  paperSizeMm,
  type SheetFrame,
  type TitleBlock,
} from './sheet'

describe('sheet defaults', () => {
  it('has no title block or frame by default', () => {
    expect(DEFAULT_SHEET.titleBlock).toBeNull()
    expect(DEFAULT_SHEET.frame).toBeNull()
  })

  it('lists four title-block positions', () => {
    expect(TITLE_BLOCK_POSITIONS).toEqual([
      'top-left',
      'top-right',
      'bottom-right',
      'bottom-left',
    ])
  })
})

describe('paperSizeMm', () => {
  it('returns A4 portrait and landscape', () => {
    const portrait: SheetFrame = {
      paper: 'A4',
      orientation: 'portrait',
      visible: true,
    }
    expect(paperSizeMm(portrait)).toEqual({
      widthMm: PAPER_SIZES_MM.A4.width,
      heightMm: PAPER_SIZES_MM.A4.height,
    })
    const landscape: SheetFrame = {
      paper: 'A4',
      orientation: 'landscape',
      visible: true,
    }
    expect(paperSizeMm(landscape)).toEqual({
      widthMm: PAPER_SIZES_MM.A4.height,
      heightMm: PAPER_SIZES_MM.A4.width,
    })
  })

  it('returns A3 sizes', () => {
    expect(PAPER_SIZES_MM.A3).toEqual({ width: 297, height: 420 })
  })
})

describe('title block shape', () => {
  it('accepts expected fields', () => {
    const block: TitleBlock = {
      title: 'T',
      createdBy: 'A',
      editedBy: 'B',
      version: '1',
      lastUpdated: '2026-01-01',
      drawingId: 'D1',
      position: 'top-left',
    }
    expect(block.position).toBe('top-left')
  })
})
