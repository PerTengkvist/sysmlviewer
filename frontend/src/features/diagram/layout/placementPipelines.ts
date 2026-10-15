/**
 * Named AutoLayout placement pipelines (Advanced presets + Simple mapping).
 */
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
  type PlacementAlgorithm,
  type PortPlacementMode,
  type SpacingPreset,
} from './autoLayoutOptions'

export const PIPELINE_IDS = [
  'connection-aware',
  'compact-pack',
  'flow-layered',
  'organic-force',
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
}

const ELK_BY_PIPELINE: Record<PlacementPipelineId, PipelineElkAlgorithm> = {
  'connection-aware': 'stress',
  'organic-force': 'force',
  'compact-pack': 'rectpacking',
  'flow-layered': 'layered',
}

function stepsFor(
  id: PlacementPipelineId,
  portPlacement: PortPlacementMode,
): PlacementPipelineStep[] {
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
      id === 'flow-layered')
  if (flow) steps.push('flow-nudge')
  steps.push('fit-boundary')
  return steps
}

function pipelineFromSimpleAlgorithm(
  algorithm: PlacementAlgorithm,
): PlacementPipelineId {
  return algorithm === 'layered' ? 'flow-layered' : 'connection-aware'
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
  return {
    id,
    elkAlgorithm: ELK_BY_PIPELINE[id],
    spacing: d.spacing,
    aspectRatio: d.aspectRatio,
    portPlacement: d.portPlacement,
    steps: stepsFor(id, d.portPlacement),
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
  }
}
