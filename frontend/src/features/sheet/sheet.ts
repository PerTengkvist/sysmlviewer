export type TitleBlockPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'

export type TitleBlock = {
  title: string
  createdBy: string
  editedBy: string
  version: string
  lastUpdated: string
  drawingId: string
  position: TitleBlockPosition
}

export type SheetFrame = {
  paper: 'A4' | 'A3'
  orientation: 'landscape' | 'portrait'
  visible: boolean
}

export type ProjectSheet = {
  titleBlock: TitleBlock | null
  frame: SheetFrame | null
}

export const DEFAULT_SHEET: ProjectSheet = {
  titleBlock: null,
  frame: null,
}

export const TITLE_BLOCK_POSITIONS: TitleBlockPosition[] = [
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
]

/** ISO paper sizes in millimetres (portrait width × height). */
export const PAPER_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
} as const

export function paperSizeMm(frame: SheetFrame): {
  widthMm: number
  heightMm: number
} {
  const base = PAPER_SIZES_MM[frame.paper]
  if (frame.orientation === 'landscape') {
    return { widthMm: base.height, heightMm: base.width }
  }
  return { widthMm: base.width, heightMm: base.height }
}

export function normalizeSheet(raw: unknown): ProjectSheet {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SHEET }
  const s = raw as Partial<ProjectSheet>
  return {
    titleBlock: s.titleBlock ?? null,
    frame: s.frame ?? null,
  }
}
