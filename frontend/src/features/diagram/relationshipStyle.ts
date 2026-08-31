import type { ArtifactKind, EdgeMarker, ElementStyle, LineStyle } from '../../api'
import type { ViewMode } from '../../settings'
import { resolveModeStyle } from './elementStyle'

export const STRUCTURE_EDGE_KINDS: ArtifactKind[] = [
  'connection',
  'dependency',
  'allocation',
  'binding',
  'flow',
  'specialization',
  'subsetting',
  'redefinition',
]

type DefaultEdgeStyle = {
  lineStyle: LineStyle
  markerEnd?: EdgeMarker
  markerStart?: EdgeMarker
  routing: 'angular' | 'direct'
}

export const DEFAULT_RELATION_EDGE_STYLE: Record<string, DefaultEdgeStyle> = {
  connection: { lineStyle: 'solid', routing: 'angular' },
  dependency: { lineStyle: 'dashed', markerEnd: 'openArrow', routing: 'direct' },
  allocation: { lineStyle: 'dashed', markerEnd: 'arrow', routing: 'direct' },
  binding: { lineStyle: 'dotted', routing: 'direct' },
  flow: { lineStyle: 'solid', markerEnd: 'arrow', routing: 'direct' },
  specialization: { lineStyle: 'solid', markerEnd: 'hollowTriangle', routing: 'direct' },
  subsetting: { lineStyle: 'dashed', markerEnd: 'hollowTriangle', routing: 'direct' },
  redefinition: { lineStyle: 'solid', markerEnd: 'triangle', routing: 'direct' },
}

export function defaultRelationStyle(kind: ArtifactKind): DefaultEdgeStyle {
  return DEFAULT_RELATION_EDGE_STYLE[kind] || DEFAULT_RELATION_EDGE_STYLE.connection
}

export function strokeDasharray(lineStyle: LineStyle | null | undefined): string | undefined {
  if (lineStyle === 'dashed') return '8 4'
  if (lineStyle === 'dotted') return '2 4'
  return undefined
}

export function mergedEdgeVisual(
  relationKind: ArtifactKind,
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
): { lineStyle: LineStyle; markerEnd?: EdgeMarker; markerStart?: EdgeMarker } {
  const defaults = defaultRelationStyle(relationKind)
  const mode = resolveModeStyle(style, viewMode)
  return {
    lineStyle: (mode.lineStyle as LineStyle | null | undefined) || defaults.lineStyle,
    markerEnd: (mode.markerEnd as EdgeMarker | null | undefined) ?? defaults.markerEnd,
    markerStart: (mode.markerStart as EdgeMarker | null | undefined) ?? defaults.markerStart,
  }
}

export function usesPortHandles(
  relationKind: ArtifactKind,
  sourceKind: string | undefined,
  targetKind: string | undefined,
): boolean {
  if (relationKind === 'connection') return true
  if (relationKind === 'flow') return sourceKind === 'port' && targetKind === 'port'
  return false
}

/** Invisible source handles on each side of a PartNode (relation edges). */
export const PART_RELATION_SOURCE_HANDLES = [
  'rel-out-left',
  'rel-out-right',
  'rel-out-top',
  'rel-out-bottom',
] as const

/** Invisible target handles on each side of a PartNode (relation edges). */
export const PART_RELATION_TARGET_HANDLES = [
  'rel-in-left',
  'rel-in-right',
  'rel-in-top',
  'rel-in-bottom',
] as const

export type RelationSide = 'left' | 'right' | 'top' | 'bottom'

export function relationSourceHandle(side: RelationSide): string {
  return `rel-out-${side}`
}

export function relationTargetHandle(side: RelationSide): string {
  return `rel-in-${side}`
}

/**
 * Pick facing boundary sides so a relation edge meets each part on its border
 * instead of ending at the part center (which hides the arrow under the node).
 */
export function pickRelationBoundarySides(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
): { sourceSide: RelationSide; targetSide: RelationSide } {
  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  const tx = target.x + target.width / 2
  const ty = target.y + target.height / 2
  const dx = tx - sx
  const dy = ty - sy
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return { sourceSide: 'right', targetSide: 'left' }
    return { sourceSide: 'left', targetSide: 'right' }
  }
  if (dy >= 0) return { sourceSide: 'bottom', targetSide: 'top' }
  return { sourceSide: 'top', targetSide: 'bottom' }
}

/** @deprecated Use boundary handles via pickRelationBoundarySides */
export const PART_CENTER_SOURCE_HANDLE = 'rel-out-right'
/** @deprecated Use boundary handles via pickRelationBoundarySides */
export const PART_CENTER_TARGET_HANDLE = 'rel-in-left'
