import type { ArtifactKind } from '../../api'

export type DiagramDoubleClickAction = 'element-dialog' | 'use-case-flow'

/** @deprecated Prefer DiagramDoubleClickAction */
export type NodeDoubleClickAction = DiagramDoubleClickAction

const DIALOG_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([
  'part',
  'interface',
  'package',
  'view',
  'requirement',
  'connection',
  'binding',
])

/**
 * What a double-click on a diagram node or edge of the given kind should open.
 * Connections, bindings, and interface usages open the same element dialog as parts.
 */
export function diagramDoubleClickAction(
  kind: ArtifactKind | undefined,
): DiagramDoubleClickAction | null {
  if (!kind) return null
  if (kind === 'useCase') return 'use-case-flow'
  if (DIALOG_KINDS.has(kind)) return 'element-dialog'
  return null
}

/** What a double-click on a diagram node of the given kind should open. */
export function nodeDoubleClickAction(
  kind: ArtifactKind | undefined,
): NodeDoubleClickAction | null {
  return diagramDoubleClickAction(kind)
}

/**
 * Which dialog opens when a related element is clicked in a details list.
 * Unlike a diagram double-click this always opens something.
 */
export function relatedDetailsAction(
  kind: ArtifactKind | undefined,
): DiagramDoubleClickAction {
  return kind === 'useCase' ? 'use-case-flow' : 'element-dialog'
}
