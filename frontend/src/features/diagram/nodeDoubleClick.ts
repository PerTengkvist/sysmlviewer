import type { ArtifactKind } from '../../api'

export type NodeDoubleClickAction = 'element-dialog' | 'use-case-flow'

const DIALOG_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([
  'part',
  'interface',
  'package',
  'view',
])

/** What a double-click on a diagram node of the given kind should open. */
export function nodeDoubleClickAction(
  kind: ArtifactKind | undefined,
): NodeDoubleClickAction | null {
  if (!kind) return null
  if (kind === 'useCase') return 'use-case-flow'
  if (DIALOG_KINDS.has(kind)) return 'element-dialog'
  return null
}
