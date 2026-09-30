import type { CSSProperties } from 'react'

/** Thick highlight in the color chosen in settings. */
export function selectedEdgeStyle(
  style: CSSProperties | undefined,
  selected: boolean,
  color: string | undefined,
  factor: number | undefined,
): CSSProperties | undefined {
  if (!selected) return style
  const baseWidth = Number(style?.strokeWidth) || 1.5
  const mult = Math.max(1, factor ?? 3)
  return {
    ...style,
    stroke: color || '#2563eb',
    strokeWidth: Math.max(1, baseWidth * mult),
  }
}
