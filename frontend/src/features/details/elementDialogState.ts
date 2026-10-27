export type ElementDialogSize = {
  width: number
  height: number
  maximized: boolean
}

export type Viewport = { width: number; height: number }

export const MIN_ELEMENT_DIALOG_WIDTH = 480
export const MIN_ELEMENT_DIALOG_HEIGHT = 320

export const DEFAULT_ELEMENT_DIALOG_SIZE: ElementDialogSize = {
  width: 960,
  height: 640,
  maximized: false,
}

const KEY = 'sysmlviewer.elementDialog'

export function clampToViewport(
  size: ElementDialogSize,
  viewport: Viewport,
): ElementDialogSize {
  const width = Math.min(
    Math.max(MIN_ELEMENT_DIALOG_WIDTH, size.width),
    Math.max(1, viewport.width),
  )
  const height = Math.min(
    Math.max(MIN_ELEMENT_DIALOG_HEIGHT, size.height),
    Math.max(1, viewport.height),
  )
  return { width, height, maximized: size.maximized }
}

export function toggleMaximized(size: ElementDialogSize): ElementDialogSize {
  return { ...size, maximized: !size.maximized }
}

/** A manual resize always leaves the maximized state. */
export function resizedTo(
  _previous: ElementDialogSize,
  width: number,
  height: number,
  viewport: Viewport,
): ElementDialogSize {
  return clampToViewport({ width, height, maximized: false }, viewport)
}

function finiteOr(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function loadElementDialogSize(): ElementDialogSize {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_ELEMENT_DIALOG_SIZE }
    const parsed = JSON.parse(raw) as Partial<ElementDialogSize>
    return {
      width: finiteOr(parsed.width, DEFAULT_ELEMENT_DIALOG_SIZE.width),
      height: finiteOr(parsed.height, DEFAULT_ELEMENT_DIALOG_SIZE.height),
      maximized: parsed.maximized === true,
    }
  } catch {
    return { ...DEFAULT_ELEMENT_DIALOG_SIZE }
  }
}

export function saveElementDialogSize(size: ElementDialogSize): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(size))
  } catch {
    // Storage may be unavailable (private mode); the dialog still works.
  }
}
