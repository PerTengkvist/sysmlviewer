export const PART_MIN_WIDTH = 120
export const PART_MIN_HEIGHT = 72
export const BOUNDARY_MIN_WIDTH = 280
export const BOUNDARY_MIN_HEIGHT = 160

export type PartSize = { width: number; height: number }

export function partMinSize(isBoundary = false): PartSize {
  return isBoundary
    ? { width: BOUNDARY_MIN_WIDTH, height: BOUNDARY_MIN_HEIGHT }
    : { width: PART_MIN_WIDTH, height: PART_MIN_HEIGHT }
}

export function clampPartSize(
  size: { width?: number; height?: number },
  opts?: { isBoundary?: boolean },
): { width?: number; height?: number } {
  const min = partMinSize(!!opts?.isBoundary)
  const out: { width?: number; height?: number } = {}
  if (size.width != null && Number.isFinite(size.width)) {
    out.width = Math.max(min.width, size.width)
  }
  if (size.height != null && Number.isFinite(size.height)) {
    out.height = Math.max(min.height, size.height)
  }
  return out
}

/**
 * Parse a blurred size field. Returns null when the value is unchanged or invalid.
 */
export function sizeFieldChange(
  field: 'width' | 'height',
  raw: string,
  current: PartSize,
  opts?: { isBoundary?: boolean },
): { width?: number; height?: number } | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (Math.round(n) === Math.round(current[field])) return null
  return clampPartSize({ [field]: n }, opts)
}
