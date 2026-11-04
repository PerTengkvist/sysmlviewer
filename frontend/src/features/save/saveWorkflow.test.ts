import { describe, expect, it, vi } from 'vitest'

import type { SaveSnapshotResult } from '../../api'
import { runSave, type SaveDeps } from './saveWorkflow'

const VIEW = 'Pkg::View'
const snapshot = { parts: {}, ports: {}, edges: {} }

function result(status: SaveSnapshotResult['status']): SaveSnapshotResult {
  return { status, mismatches: [], events: [] }
}

function deps(overrides: Partial<SaveDeps> = {}): SaveDeps {
  return {
    settle: vi.fn().mockResolvedValue(undefined),
    currentViewId: () => VIEW,
    readSnapshot: () => snapshot,
    saveProject: vi.fn().mockResolvedValue({ id: 'p' }),
    saveSnapshot: vi.fn().mockResolvedValue(result('confirmed')),
    reportFailure: vi.fn(),
    ...overrides,
  }
}

describe('runSave', () => {
  it('saves the project and then the snapshot of the open view', async () => {
    const calls: string[] = []
    const d = deps({
      saveProject: vi.fn(async () => {
        calls.push('project')
        return { id: 'p' }
      }),
      saveSnapshot: vi.fn(async () => {
        calls.push('snapshot')
        return result('confirmed')
      }),
    })

    const outcome = await runSave(d)

    expect(calls).toEqual(['project', 'snapshot'])
    expect(d.saveSnapshot).toHaveBeenCalledWith(VIEW, snapshot)
    expect(outcome).toMatchObject({ status: 'confirmed', openDrawer: false })
  })

  it('waits for pending writes before reading the snapshot', async () => {
    const calls: string[] = []
    const d = deps({
      settle: vi.fn(async () => {
        calls.push('settle')
      }),
      readSnapshot: () => {
        calls.push('read')
        return snapshot
      },
    })

    await runSave(d)

    expect(calls).toEqual(['settle', 'read'])
  })

  it('stops verifying when the view changes while saving', async () => {
    const views = [VIEW, 'Pkg::Other']
    const d = deps({ currentViewId: () => views.shift() ?? 'Pkg::Other' })

    const outcome = await runSave(d)

    expect(d.saveProject).toHaveBeenCalled()
    expect(d.saveSnapshot).not.toHaveBeenCalled()
    expect(d.reportFailure).toHaveBeenCalledWith(
      expect.stringContaining('view changed'),
      VIEW,
    )
    expect(outcome).toMatchObject({ status: 'aborted', openDrawer: true })
  })

  it('opens the drawer and names the count on a mismatch', async () => {
    const d = deps({
      saveSnapshot: vi.fn().mockResolvedValue({
        ...result('mismatch'),
        mismatches: [{ id: 'a' }, { id: 'b' }],
      }),
    })

    const outcome = await runSave(d)

    expect(outcome.status).toBe('mismatch')
    expect(outcome.openDrawer).toBe(true)
    expect(outcome.error).toContain('2 mismatches')
  })

  it('does not log a failure again that the backend already logged', async () => {
    const d = deps({ saveSnapshot: vi.fn().mockRejectedValue(new Error('403')) })

    const outcome = await runSave(d)

    expect(outcome).toMatchObject({ status: 'failed', openDrawer: true })
    expect(outcome.error).toContain('403')
    expect(d.reportFailure).not.toHaveBeenCalled()
  })

  it('logs a failure the backend cannot have seen', async () => {
    const d = deps({
      saveProject: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })

    const outcome = await runSave(d)

    expect(outcome).toMatchObject({ status: 'failed', openDrawer: true })
    expect(d.saveSnapshot).not.toHaveBeenCalled()
    expect(d.reportFailure).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch'),
      VIEW,
    )
  })

  it('saves only the project when a document tab replaces the diagram', async () => {
    const d = deps({ readSnapshot: () => null })

    const outcome = await runSave(d)

    expect(outcome.status).toBe('project-only')
    expect(d.saveSnapshot).not.toHaveBeenCalled()
    expect(outcome.openDrawer).toBe(false)
  })

  it('saves only the project when no view is open', async () => {
    const d = deps({ currentViewId: () => null })

    const outcome = await runSave(d)

    expect(d.saveProject).toHaveBeenCalled()
    expect(d.saveSnapshot).not.toHaveBeenCalled()
    expect(outcome.status).toBe('project-only')
  })

  it('keeps the saved project for the caller', async () => {
    const outcome = await runSave(deps())

    expect(outcome.project).toEqual({ id: 'p' })
  })
})
