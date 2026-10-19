/**
 * Named AutoLayout placement pipelines (Advanced presets + Simple mapping).
 */
import {
  clampLevelWeights,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
  type LevelWeights,
  type PlacementAlgorithm,
  type PortPlacementMode,
  type SpacingPreset,
} from './autoLayoutOptions'

export const PIPELINE_IDS = [
  'connection-aware',
  'compact-pack',
  'flow-layered',
  'organic-force',
  'custom',
  'clustered',
  'favour-grid',
] as const

export type PlacementPipelineId = (typeof PIPELINE_IDS)[number]

/** ELK algorithm used as the primary placement step. */
export type PipelineElkAlgorithm =
  | 'stress'
  | 'layered'
  | 'force'
  | 'rectpacking'

export type PlacementPipelineStep =
  | 'nest-layout'
  | 'primary-layout'
  | 'nest-fit'
  | 'non-overlap'
  | 'flow-nudge'
  | 'fit-boundary'

export type ResolvedPlacementPipeline = {
  id: PlacementPipelineId
  elkAlgorithm: PipelineElkAlgorithm
  spacing: SpacingPreset
  aspectRatio: number
  portPlacement: PortPlacementMode
  /** Ordered post/primary steps for UI + runner. */
  steps: PlacementPipelineStep[]
  /** Present when id === 'custom' (clamped level weights). */
  customWeights?: LevelWeights
}

const ELK_BY_PIPELINE: Record<PlacementPipelineId, PipelineElkAlgorithm> = {
  'connection-aware': 'stress',
  'organic-force': 'force',
  'compact-pack': 'rectpacking',
  'flow-layered': 'layered',
  // Fallback until layoutStructureWithElk applies adaptive root choice.
  custom: 'stress',
  // Composition pipelines do not use ELK for primary placement.
  clustered: 'rectpacking',
  'favour-grid': 'rectpacking',
}

function isCompositionPipeline(id: PlacementPipelineId): boolean {
  return id === 'clustered' || id === 'favour-grid'
}

function stepsFor(
  id: PlacementPipelineId,
  portPlacement: PortPlacementMode,
): PlacementPipelineStep[] {
  if (isCompositionPipeline(id)) {
    // Composition owns H/V; ports still follow portPlacement after place.
    return ['nest-layout', 'nest-fit', 'non-overlap', 'fit-boundary']
  }
  const steps: PlacementPipelineStep[] = [
    'nest-layout',
    'primary-layout',
    'nest-fit',
    'non-overlap',
  ]
  const flow =
    portPlacement === 'inputsLeftOutputsRight' &&
    (id === 'connection-aware' ||
      id === 'organic-force' ||
      id === 'flow-layered' ||
      id === 'custom')
  if (flow) steps.push('flow-nudge')
  steps.push('fit-boundary')
  return steps
}

function pipelineFromSimpleAlgorithm(
  algorithm: PlacementAlgorithm,
): PlacementPipelineId {
  if (algorithm === 'layered') return 'flow-layered'
  if (algorithm === 'clustered') return 'clustered'
  if (algorithm === 'favour-grid') return 'favour-grid'
  return 'connection-aware'
}

export function isPlacementPipelineId(raw: string): raw is PlacementPipelineId {
  return (PIPELINE_IDS as readonly string[]).includes(raw)
}

/**
 * Resolve dialog directives to a concrete pipeline + ELK primary algorithm.
 * Simple mode maps stress→connection-aware, layered→flow-layered.
 * Advanced mode uses `pipeline` as-is.
 */
export function resolvePlacementPipeline(
  directives: AutoLayoutDirectives,
): ResolvedPlacementPipeline {
  const d = { ...DEFAULT_AUTO_LAYOUT_DIRECTIVES, ...directives }
  const mode = d.mode ?? 'simple'
  let id: PlacementPipelineId
  if (mode === 'advanced' && d.pipeline && isPlacementPipelineId(d.pipeline)) {
    id = d.pipeline
  } else {
    id = pipelineFromSimpleAlgorithm(d.algorithm)
  }
  const customWeights =
    id === 'custom' ? clampLevelWeights(d.customWeights) : undefined
  return {
    id,
    elkAlgorithm: ELK_BY_PIPELINE[id],
    spacing: d.spacing,
    aspectRatio: d.aspectRatio,
    portPlacement: d.portPlacement,
    steps: stepsFor(id, d.portPlacement),
    customWeights,
  }
}

export function pipelineLabel(id: PlacementPipelineId): string {
  switch (id) {
    case 'connection-aware':
      return 'Connection-aware (stress)'
    case 'compact-pack':
      return 'Compact pack'
    case 'flow-layered':
      return 'Flow layered (L→R)'
    case 'organic-force':
      return 'Organic force'
    case 'custom':
      return 'Custom (adaptive)'
    case 'clustered':
      return 'Clustered (onion-leaning)'
    case 'favour-grid':
      return 'Favour grid (matrix-leaning)'
  }
}
