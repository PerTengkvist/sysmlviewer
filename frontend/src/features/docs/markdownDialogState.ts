import {
  clampToViewport,
  DEFAULT_ELEMENT_DIALOG_SIZE,
  resizedTo,
  toggleMaximized,
  type ElementDialogSize,
  type Viewport,
} from '../details/elementDialogState'

export type MarkdownDialogSize = ElementDialogSize

export const DEFAULT_MARKDOWN_DIALOG_SIZE: MarkdownDialogSize = {
  ...DEFAULT_ELEMENT_DIALOG_SIZE,
}

const KEY = 'sysmlviewer.markdownDialog'

export { clampToViewport, resizedTo, toggleMaximized }
export type { Viewport }

function finiteOr(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function loadMarkdownDialogSize(): MarkdownDialogSize {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_MARKDOWN_DIALOG_SIZE }
    const parsed = JSON.parse(raw) as Partial<MarkdownDialogSize>
    return {
      width: finiteOr(parsed.width, DEFAULT_MARKDOWN_DIALOG_SIZE.width),
      height: finiteOr(parsed.height, DEFAULT_MARKDOWN_DIALOG_SIZE.height),
      maximized: parsed.maximized === true,
    }
  } catch {
    return { ...DEFAULT_MARKDOWN_DIALOG_SIZE }
  }
}

export function saveMarkdownDialogSize(size: MarkdownDialogSize): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(size))
  } catch {
    // Storage may be unavailable (private mode); the dialog still works.
  }
}
