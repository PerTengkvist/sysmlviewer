import type { ViewPayload } from '../../../../api'

/**
 * Where a per-view choice (matrix rows / columns, lane layout) is saved: the view the diagram on
 * screen belongs to, not the id the app is switching to. `activeViewId` changes before the
 * payload of the new view has arrived, and a choice made in that gap would be saved to the
 * wrong view.
 */
export function choiceTarget<K extends 'realizationMatrix' | 'useCaseRealizationLayout'>(
  payload: Pick<ViewPayload, 'view' | K> | null,
  key: K,
): { viewId: string; initial: NonNullable<ViewPayload[K]> | null } | null {
  if (!payload) return null
  return { viewId: payload.view.id, initial: (payload[key] ?? null) as NonNullable<ViewPayload[K]> | null }
}
