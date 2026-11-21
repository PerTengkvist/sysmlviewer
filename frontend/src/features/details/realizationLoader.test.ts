import { describe, expect, it, vi } from 'vitest'
import type { Realization } from '../../api'
import { createRealizationLoader } from './realizationLoader'

const empty = (n: number): Realization => ({
  links: [],
  actorSteps: {},
  systemSteps: {},
  stepRealizers: {},
  coarseRealizers: {},
  realizerNodes: {},
  nodeParts: {},
  useCases: {},
  inScope: ['n' + n],
  findings: [],
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createRealizationLoader', () => {
  it('does not fetch again when only the layout changed (same semantic object)', async () => {
    const fetchFn = vi.fn(async () => empty(1))
    const seen: (Realization | null)[] = []
    const loader = createRealizationLoader(fetchFn, (r) => seen.push(r))
    const semantic = {}
    loader.update({ id: 'p1', semantic })
    await flush()
    loader.update({ id: 'p1', semantic }) // patchVisualization: new updatedAt, same semantic
    await flush()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    loader.update({ id: 'p1', semantic: {} }) // the model changed
    await flush()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('clears at once when the project changes and ignores a stale answer', async () => {
    let resolveFirst: (r: Realization) => void = () => {}
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Realization>((r) => (resolveFirst = r)))
      .mockImplementationOnce(async () => empty(2))
    const seen: (Realization | null)[] = []
    const loader = createRealizationLoader(fetchFn, (r) => seen.push(r))
    loader.update({ id: 'p1', semantic: {} })
    loader.update({ id: 'p2', semantic: {} })
    expect(seen).toEqual([null]) // nulled synchronously on the switch
    await flush()
    resolveFirst(empty(1))
    await flush()
    expect(seen.map((r) => r?.inScope[0] ?? null)).toEqual([null, 'n2'])
  })

  it('clears when there is no project', () => {
    const seen: (Realization | null)[] = []
    const loader = createRealizationLoader(async () => empty(1), (r) => seen.push(r))
    loader.update(null)
    expect(seen).toEqual([null])
  })
})
