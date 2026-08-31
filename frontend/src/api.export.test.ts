import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('api.exportView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ path: null }),
      }),
    )
  })

  it('POSTs the export endpoint for the open view', async () => {
    const result = await api.exportView('proj-1', 'Pkg::BoxView')
    expect(result).toEqual({ path: null })
    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/views/Pkg%3A%3ABoxView/export',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      }),
    )
  })
})
