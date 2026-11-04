import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

const body = { parts: {}, ports: {}, edges: {} }

describe('event and snapshot calls', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }),
    )
  })

  it('POSTs the snapshot with notation and levels', async () => {
    await api.saveViewSnapshot('p1', 'Pkg::V', {
      ...body,
      structureNotation: 'arcadia',
      levels: 3,
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/p1/views/Pkg%3A%3AV/save-snapshot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...body, structureNotation: 'arcadia', levels: 3 }),
      }),
    )
  })

  it('POSTs a compare with its trigger', async () => {
    await api.compareView('p1', 'Pkg::V', { ...body, trigger: 'restore' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/p1/views/Pkg%3A%3AV/compare',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...body, trigger: 'restore' }),
      }),
    )
  })

  it('GETs events after a sequence number', async () => {
    await api.getEvents('p1', 12)

    expect(fetch).toHaveBeenCalledWith('/api/projects/p1/events?after=12', undefined)
  })

  it('POSTs a client event', async () => {
    await api.postClientEvent('p1', { message: 'Reroute failed', viewId: 'V' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/p1/events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Reroute failed', viewId: 'V' }),
      }),
    )
  })
})
