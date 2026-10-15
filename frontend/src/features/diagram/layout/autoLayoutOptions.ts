/**
 * User-facing AutoLayout directives (dialog → placement pipelines / ports).
 */

import type { PlacementPipelineId } from './placementPipelines'

export type PortPlacementMode = 'inputsLeftOutputsRight' | 'optimized'

/** How parts are arranged from connections (Simple mode). */
export type PlacementAlgorithm = 'stress' | 'layered'

export type SpacingPreset = 'compact' | 'normal' | 'spacious'

export type AutoLayoutUiMode = 'simple' | 'advanced'

export type AutoLayoutDirectives = {
  /** Simple ≈ legacy controls; Advanced = named pipeline preset. */
  mode?: AutoLayoutUiMode
  /** Advanced: which named pipeline to run. Ignored in simple mode. */
  pipeline?: PlacementPipelineId
  /** Port sides before / after part placement. */
  portPlacement: PortPlacementMode
  /** Simple: stress ≈ connection-aware; layered ≈ flow-layered. */
  algorithm: PlacementAlgorithm
  /** Distance between connected parts (centers). */
  spacing: SpacingPreset
  /** Target width/height of the diagram (stress / force). */
  aspectRatio: number
}

export const DEFAULT_AUTO_LAYOUT_DIRECTIVES: AutoLayoutDirectives = {
  mode: 'simple',
  pipeline: 'connection-aware',
  // Default to IO sides + flow nudge so Out→In pairs sit left→right.
  portPlacement: 'inputsLeftOutputsRight',
  algorithm: 'stress',
  spacing: 'normal',
  aspectRatio: 1,
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
