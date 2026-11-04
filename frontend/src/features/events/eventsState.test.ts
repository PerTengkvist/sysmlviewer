import { describe, expect, it } from 'vitest'

import type { EventRecord } from '../../api'
import {
  addLocalEvent,
  emptyEventsState,
  latestSeq,
  mergeEvents,
  resolveLocalEvent,
  unseenErrorCount,
  visibleRows,
} from './eventsState'

function event(seq: number, level: EventRecord['level'] = 'info'): EventRecord {
  return {
    seq,
    ts: `2026-11-04T10:00:0${seq}Z`,
    level,
    code: 'code',
    viewId: null,
    viewName: null,
    message: `event ${seq}`,
    details: [],
  }
}

describe('eventsState', () => {
  it('merges by sequence number without duplicates', () => {
    const first = mergeEvents(emptyEventsState(), [event(1), event(2)])

    const next = mergeEvents(first, [event(2), event(3)])

    expect(next.events.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('keeps events in sequence order when they arrive out of order', () => {
    const state = mergeEvents(emptyEventsState(), [event(3), event(1)])

    expect(state.events.map((e) => e.seq)).toEqual([1, 3])
  })

  it('reports the highest known sequence number', () => {
    expect(latestSeq(emptyEventsState())).toBe(0)
    expect(latestSeq(mergeEvents(emptyEventsState(), [event(4)]))).toBe(4)
  })

  it('counts errors newer than the last one seen', () => {
    const state = mergeEvents(emptyEventsState(), [
      event(1, 'error'),
      event(2, 'info'),
      event(3, 'error'),
      event(4, 'warning'),
    ])

    expect(unseenErrorCount(state, 0)).toBe(2)
    expect(unseenErrorCount(state, 1)).toBe(1)
    expect(unseenErrorCount(state, 3)).toBe(0)
  })

  it('counts undelivered local events as errors', () => {
    const state = addLocalEvent(emptyEventsState(), {
      message: 'Backend unreachable',
    })

    expect(unseenErrorCount(state, 0)).toBe(1)
  })

  it('shows newest rows first and marks local rows', () => {
    const merged = mergeEvents(emptyEventsState(), [event(1), event(2)])
    const state = addLocalEvent(merged, { message: 'Backend unreachable' })

    const rows = visibleRows(state)

    expect(rows.map((r) => r.message)).toEqual([
      'Backend unreachable',
      'event 2',
      'event 1',
    ])
    expect(rows[0].localOnly).toBe(true)
    expect(rows[1].localOnly).toBe(false)
  })

  it('drops a local row once the backend has stored it', () => {
    const state = addLocalEvent(emptyEventsState(), { message: 'x' })
    const localId = state.local[0].localId

    const next = resolveLocalEvent(state, localId, event(5, 'error'))

    expect(next.local).toEqual([])
    expect(next.events.map((e) => e.seq)).toEqual([5])
  })
})
