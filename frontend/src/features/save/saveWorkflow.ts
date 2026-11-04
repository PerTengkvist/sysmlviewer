import type { SaveSnapshotResult, ViewSnapshot } from '../../api'

export type SaveDeps<P = unknown> = {
  /** Resolves once queued layout writes and reroutes are finished. */
  settle: () => Promise<void>
  currentViewId: () => string | null
  /** Null when no diagram is showing, as on a document tab. */
  readSnapshot: () => ViewSnapshot | null
  saveProject: () => Promise<P>
  saveSnapshot: (viewId: string, snapshot: ViewSnapshot) => Promise<SaveSnapshotResult>
  /** Logs what the backend cannot know about. */
  reportFailure: (message: string, viewId: string | null) => void
}

export type SaveStatus =
  | SaveSnapshotResult['status']
  | 'project-only'
  | 'aborted'
  | 'failed'

export type SaveOutcome<P = unknown> = {
  status: SaveStatus
  openDrawer: boolean
  error?: string
  project?: P
}

/** `fetch` rejects with a TypeError when the request never reached the backend. */
export function neverReachedBackend(error: unknown): boolean {
  return error instanceof TypeError
}

export async function runSave<P>(deps: SaveDeps<P>): Promise<SaveOutcome<P>> {
  const viewId = deps.currentViewId()
  let project: P | undefined
  try {
    await deps.settle()
    project = await deps.saveProject()
    if (!viewId) return { status: 'project-only', openDrawer: false, project }
    if (deps.currentViewId() !== viewId) {
      const error = 'The view changed during save, so the diagram was not verified.'
      deps.reportFailure(error, viewId)
      return { status: 'aborted', openDrawer: true, error, project }
    }
    const snapshot = deps.readSnapshot()
    if (!snapshot) return { status: 'project-only', openDrawer: false, project }

    const result = await deps.saveSnapshot(viewId, snapshot)
    if (result.status === 'mismatch') {
      return {
        status: 'mismatch',
        openDrawer: true,
        error: `Save finished with ${result.mismatches.length} mismatches. See Events.`,
        project,
      }
    }
    return { status: result.status, openDrawer: false, project }
  } catch (error) {
    const message = String(error)
    if (neverReachedBackend(error)) deps.reportFailure(message, viewId)
    return { status: 'failed', openDrawer: true, error: message, project }
  }
}
