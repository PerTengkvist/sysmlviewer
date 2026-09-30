import type { CSSProperties } from 'react'
import { MarkerType } from '@xyflow/react'
import type { ElementStyle, ElementStyleMode } from '../../api'
import type { ViewMode } from '../../settings'
import {
  FILLED_DIAMOND_MARKER_ID,
  HOLLOW_DIAMOND_MARKER_ID,
} from './EdgeMarkerDefs'
import { strokeDasharray } from './relationshipStyle'

export const STYLE_DEFAULTS: Record<
  ViewMode,
  Required<Pick<ElementStyleMode, 'backgroundColor' | 'lineColor' | 'textColor'>> & {
    nodeThickness: number
    edgeThickness: number
  }
> = {
  light: {
    backgroundColor: '#ffffff',
    lineColor: '#2c3e50',
    textColor: '#1a2330',
    nodeThickness: 1.5,
    edgeThickness: 2,
  },
  dark: {
    backgroundColor: '#151c24',
    lineColor: '#8b9aab',
    textColor: '#d8e0e8',
    nodeThickness: 1.5,
    edgeThickness: 2,
  },
}

export function resolveModeStyle(
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
): ElementStyleMode {
  return (viewMode === 'dark' ? style?.dark : style?.light) || {}
}

export function nodeInlineStyle(
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
  opts?: { isBoundary?: boolean },
): CSSProperties {
  const mode = resolveModeStyle(style, viewMode)
  const defaults = STYLE_DEFAULTS[viewMode]
  const thickness = mode.lineThickness ?? defaults.nodeThickness
  const out: CSSProperties = {}
  const headerOn = mode.backgroundHeader !== false
  const bodyOn = mode.backgroundBody !== false
  // Whole-object fill only when both regions accept the color
  if (mode.backgroundColor && headerOn && bodyOn) {
    out.backgroundColor = mode.backgroundColor
  }
  if (mode.lineColor) {
    out.borderColor = mode.lineColor
  }
  if (mode.lineThickness != null) {
    out.borderWidth = thickness
    out.borderStyle = opts?.isBoundary ? 'dashed' : 'solid'
  }
  if (mode.textColor) out.color = mode.textColor
  return out
}

export type NodeRegionStyles = {
  root: CSSProperties
  header: CSSProperties
  body: CSSProperties
}

/** Resolve root/header/body backgrounds from style flags. */
export function nodeInlineStyles(
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
  opts?: { isBoundary?: boolean },
): NodeRegionStyles {
  const mode = resolveModeStyle(style, viewMode)
  const defaults = STYLE_DEFAULTS[viewMode]
  const root = nodeInlineStyle(style, viewMode, opts)
  const headerOn = mode.backgroundHeader !== false
  const bodyOn = mode.backgroundBody !== false
  const color = mode.backgroundColor
  const header: CSSProperties = {}
  const body: CSSProperties = {}
  if (color) {
    if (headerOn && bodyOn) {
      // Also paint header/body: .part-node-header has an opaque CSS fill that
      // would otherwise mask the root backgroundColor.
      header.backgroundColor = color
      body.backgroundColor = color
    } else if (headerOn && !bodyOn) {
      header.backgroundColor = color
      body.backgroundColor = defaults.backgroundColor
    } else if (!headerOn && bodyOn) {
      header.backgroundColor = defaults.backgroundColor
      body.backgroundColor = color
    } else {
      // both off → defaults
      header.backgroundColor = defaults.backgroundColor
      body.backgroundColor = defaults.backgroundColor
    }
  }
  return { root, header, body }
}

export function edgeStrokeStyle(
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
): {
  stroke: string
  strokeWidth: number
  color?: string
  strokeDasharray?: string
} {
  const mode = resolveModeStyle(style, viewMode)
  const defaults = STYLE_DEFAULTS[viewMode]
  return {
    stroke: mode.lineColor || 'var(--part-stroke)',
    strokeWidth: mode.lineThickness ?? defaults.edgeThickness,
    color: mode.textColor || undefined,
    strokeDasharray: strokeDasharray(mode.lineStyle as 'solid' | 'dashed' | 'dotted' | null | undefined),
  }
}

/** Stroke for a selected edge: highlight color and thickness × factor. */
export function selectedEdgeStroke(
  style: ElementStyle | null | undefined,
  viewMode: ViewMode,
  highlight: { color: string; factor: number },
): { stroke: string; strokeWidth: number } {
  const base = edgeStrokeStyle(style, viewMode)
  const factor = Math.max(1, highlight.factor)
  return {
    stroke: highlight.color,
    strokeWidth: base.strokeWidth * factor,
  }
}

export type ReactFlowMarker =
  | string
  | {
      type: MarkerType
      width: number
      height: number
      color?: string
    }

/** Map SysML edge markers to React Flow markers (custom SVG ids for diamonds). */
export function reactFlowMarker(
  marker: string | null | undefined,
): ReactFlowMarker | undefined {
  if (!marker || marker === 'none') return undefined
  // Real diamond glyphs via EdgeMarkerDefs — RF Arrow/ArrowClosed are triangles.
  if (marker === 'hollowDiamond') return HOLLOW_DIAMOND_MARKER_ID
  if (marker === 'filledDiamond') return FILLED_DIAMOND_MARKER_ID
  if (marker === 'openArrow' || marker === 'hollowTriangle') {
    return { type: MarkerType.Arrow, width: 16, height: 16 }
  }
  return { type: MarkerType.ArrowClosed, width: 14, height: 14 }
}

/** Soft kind-tinted fills when no custom style is set (light/dark aware). */
export const KIND_FILL: Record<string, { light: string; dark: string }> = {
  // Lifelines: darker in light mode / lighter in dark mode for clearer contrast
  lifeline: { light: '#9aabbc', dark: '#6b7f96' },
  state: { light: '#f7f3ee', dark: '#1c2220' },
  action: { light: '#eef5f2', dark: '#1a2420' },
  tree: { light: '#f5f5f2', dark: '#1a1e22' },
}

export function kindBackground(
  kind: string,
  viewMode: ViewMode,
  style?: ElementStyle | null,
): string | undefined {
  const custom = resolveModeStyle(style, viewMode).backgroundColor
  if (custom) return custom
  const tint = KIND_FILL[kind]
  return tint ? tint[viewMode] : undefined
}
