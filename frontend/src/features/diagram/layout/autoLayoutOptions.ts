/**
 * User-facing AutoLayout directives (dialog → placement pipelines / ports).
 */

import type { LayerDirection } from '../../../api'
import type { PlacementPipelineId } from './placementPipelines'
import type { LayoutConstraints } from './layoutConstraints'

export type PortPlacementMode = 'inputsLeftOutputsRight' | 'optimized'

/** How parts are arranged (Simple mode). */
export type PlacementAlgorithm =
  | 'stress'
  | 'layered'
  | 'clustered'
  | 'favour-grid'

export type SpacingPreset = 'compact' | 'normal' | 'spacious'

export type AutoLayoutUiMode = 'simple' | 'advanced'

/** Nest / hierarchy band for adaptive custom pipeline. */
export type LayoutLevel = 'leaf' | 'mid' | 'root'

/** Aspects the custom pipeline weights (each clamped 0..1). */
export type LayoutWeightKey =
  | 'connectionAwareness'
  | 'flowDirection'
  | 'compactness'
  | 'portClarity'
  | 'bendMinimization'

export type LayoutWeights = Record<LayoutWeightKey, number>

/** Per-level weights for the Advanced "custom" pipeline. */
export type LevelWeights = Record<LayoutLevel, LayoutWeights>

export const LAYOUT_WEIGHT_KEYS: LayoutWeightKey[] = [
  'connectionAwareness',
  'flowDirection',
  'compactness',
  'portClarity',
  'bendMinimization',
]

export const LAYOUT_LEVELS: LayoutLevel[] = ['leaf', 'mid', 'root']

/** Suggested defaults per nest level (custom pipeline). */
export const SUGGESTED_LEVEL_WEIGHTS: LevelWeights = {
  leaf: {
    connectionAwareness: 0.35,
    flowDirection: 0.55,
    compactness: 0.25,
    portClarity: 0.9,
    bendMinimization: 0.8,
  },
  mid: {
    connectionAwareness: 0.7,
    flowDirection: 0.5,
    compactness: 0.35,
    portClarity: 0.6,
    bendMinimization: 0.55,
  },
  root: {
    connectionAwareness: 0.85,
    flowDirection: 0.45,
    compactness: 0.3,
    portClarity: 0.5,
    bendMinimization: 0.5,
  },
}

export function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function clampLayoutWeights(
  weights: Partial<LayoutWeights> | undefined,
  fallback: LayoutWeights,
): LayoutWeights {
  const out = { ...fallback }
  if (!weights) return out
  for (const key of LAYOUT_WEIGHT_KEYS) {
    if (typeof weights[key] === 'number') {
      out[key] = clampWeight(weights[key] as number)
    }
  }
  return out
}

export function clampLevelWeights(
  weights: Partial<LevelWeights> | undefined,
): LevelWeights {
  return {
    leaf: clampLayoutWeights(weights?.leaf, SUGGESTED_LEVEL_WEIGHTS.leaf),
    mid: clampLayoutWeights(weights?.mid, SUGGESTED_LEVEL_WEIGHTS.mid),
    root: clampLayoutWeights(weights?.root, SUGGESTED_LEVEL_WEIGHTS.root),
  }
}

export function layoutWeightLabel(key: LayoutWeightKey): string {
  switch (key) {
    case 'connectionAwareness':
      return 'Connection awareness'
    case 'flowDirection':
      return 'Flow direction (L→R)'
    case 'compactness':
      return 'Compactness'
    case 'portClarity':
      return 'Port clarity'
    case 'bendMinimization':
      return 'Bend minimization'
  }
}

export function layoutLevelLabel(level: LayoutLevel): string {
  switch (level) {
    case 'leaf':
      return 'Leaf'
    case 'mid':
      return 'Mid'
    case 'root':
      return 'Root'
  }
}

/** ELK layered direction. */
export type HierarchicDirection = 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'

/** Advanced "Hierarchic (yEd-style)" pipeline options — the five Sugiyama phases. */
export type HierarchicOptions = {
  direction: HierarchicDirection
  /** Phase 1: cycle breaking. */
  cycleBreaking: 'GREEDY' | 'DEPTH_FIRST' | 'MODEL_ORDER'
  /** Phase 2: layer assignment (ignored for incremental = INTERACTIVE). */
  layering: 'NETWORK_SIMPLEX' | 'LONGEST_PATH' | 'COFFMAN_GRAHAM'
  /** Phase 3: crossing minimisation effort (elk.layered.thoroughness, 1–50). */
  crossingThoroughness: number
  /** Phase 4: node placement. */
  nodePlacement: 'BRANDES_KOEPF' | 'NETWORK_SIMPLEX' | 'LINEAR_SEGMENTS' | 'SIMPLE'
  /** Port constraints handed to ELK (port candidates still bound the sides). */
  portConstraints: 'FIXED_SIDE' | 'FIXED_ORDER' | 'FREE'
  /** Keep the current arrangement (interactive layering / crossing min). */
  incremental: boolean
  /** Outer port-side iterations (ELK runs), ≥ 1. */
  maxIterations: number
}

export const DEFAULT_HIERARCHIC_OPTIONS: HierarchicOptions = {
  direction: 'RIGHT',
  cycleBreaking: 'GREEDY',
  layering: 'NETWORK_SIMPLEX',
  crossingThoroughness: 10,
  nodePlacement: 'BRANDES_KOEPF',
  portConstraints: 'FIXED_SIDE',
  incremental: false,
  maxIterations: 3,
}

export function clampHierarchicOptions(
  partial: Partial<HierarchicOptions> | undefined,
): HierarchicOptions {
  const o = { ...DEFAULT_HIERARCHIC_OPTIONS, ...(partial || {}) }
  o.crossingThoroughness = Math.max(
    1,
    Math.min(50, Math.round(Number(o.crossingThoroughness) || 10)),
  )
  o.maxIterations = Math.max(
    1,
    Math.min(10, Math.round(Number(o.maxIterations) || 1)),
  )
  return o
}

export function hierarchicDirectionForLayers(
  direction: LayerDirection,
): HierarchicDirection {
  switch (direction) {
    case 'top-down':
      return 'DOWN'
    case 'bottom-up':
      return 'UP'
    case 'right-left':
      return 'LEFT'
    default:
      return 'RIGHT'
  }
}

export function layerDirectionForHierarchic(
  direction: HierarchicDirection,
): LayerDirection {
  switch (direction) {
    case 'DOWN':
      return 'top-down'
    case 'UP':
      return 'bottom-up'
    case 'LEFT':
      return 'right-left'
    default:
      return 'left-right'
  }
}

export type AutoLayoutDirectives = {
  /** Simple ≈ legacy controls; Advanced = named pipeline preset. */
  mode?: AutoLayoutUiMode
  /** Advanced: which named pipeline to run. Ignored in simple mode. */
  pipeline?: PlacementPipelineId
  /** Port sides before / after part placement. */
  portPlacement: PortPlacementMode
  /** Simple: stress / layered / clustered / favour-grid. */
  algorithm: PlacementAlgorithm
  /** Distance between connected parts (centers). */
  spacing: SpacingPreset
  /** Target width/height of the diagram (stress / force). */
  aspectRatio: number
  /** Advanced custom pipeline: per-level aspect weights (0..1). */
  customWeights?: LevelWeights
  /** Advanced hierarchic pipeline options. */
  hierarchic?: HierarchicOptions
  /** Layout Rules / layered layout as hard constraints (hierarchic pipeline). */
  constraints?: LayoutConstraints
}

export const DEFAULT_AUTO_LAYOUT_DIRECTIVES: AutoLayoutDirectives = {
  mode: 'simple',
  pipeline: 'favour-grid',
  // Default favour-grid composition + IO sides; ports combine with placement.
  portPlacement: 'inputsLeftOutputsRight',
  algorithm: 'favour-grid',
  spacing: 'normal',
  aspectRatio: 1,
  customWeights: SUGGESTED_LEVEL_WEIGHTS,
}

export function spacingToDesiredEdgeLength(spacing: SpacingPreset): number {
  switch (spacing) {
    case 'compact':
      return 120
    case 'spacious':
      return 260
    default:
      return 180
  }
}

export function spacingToNodeNode(spacing: SpacingPreset): number {
  switch (spacing) {
    case 'compact':
      return 64
    case 'spacious':
      return 128
    default:
      return 96
  }
}

export type PortFlowRole = 'in' | 'out' | 'unknown'

/**
 * Infer consumer (in) vs provider (out) from SysML-ish names and connection ends.
 * Names like `energyIn` / `directionOut` win; otherwise source⇒out, target⇒in.
 */
export function inferPortFlowRole(
  port: { id: string; name: string },
  links: { sourcePort: string; targetPort: string }[],
): PortFlowRole {
  const name = port.name.trim()
  if (/In$/i.test(name) || /(^|[_\s-])in$/i.test(name)) return 'in'
  if (/Out$/i.test(name) || /(^|[_\s-])out$/i.test(name)) return 'out'

  let asSource = 0
  let asTarget = 0
  for (const l of links) {
    if (l.sourcePort === port.id) asSource += 1
    if (l.targetPort === port.id) asTarget += 1
  }
  if (asTarget > asSource) return 'in'
  if (asSource > asTarget) return 'out'
  return 'unknown'
}
