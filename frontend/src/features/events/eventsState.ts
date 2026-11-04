import type { EventDetail, EventLevel, EventRecord } from '../../api'

const MAX_ROWS = 500

export type LocalEvent = {
  localId: string
  ts: string
  message: string
  viewId?: string | null
  viewName?: string | null
}

export type EventsState = {
  events: EventRecord[]
  /** Failures that have not reached the backend log yet. */
  local: LocalEvent[]
  nextLocalId: number
}

export type EventRow = {
  key: string
  ts: string
  level: EventLevel
  code: string
  message: string
  details: EventDetail[]
  localOnly: boolean
}

export function emptyEventsState(): EventsState {
  return { events: [], local: [], nextLocalId: 1 }
}

export function latestSeq(state: EventsState): number {
  return state.events.at(-1)?.seq ?? 0
}

export function mergeEvents(
  state: EventsState,
  incoming: EventRecord[],
): EventsState {
  const bySeq = new Map(state.events.map((event) => [event.seq, event]))
  for (const event of incoming) bySeq.set(event.seq, event)
  const events = [...bySeq.values()]
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_ROWS)
  return { ...state, events }
}

export function addLocalEvent(
  state: EventsState,
  event: Pick<LocalEvent, 'message' | 'viewId' | 'viewName'>,
): EventsState {
  const local: LocalEvent = {
    ...event,
    localId: `local-${state.nextLocalId}`,
    ts: new Date().toISOString(),
  }
  return {
    ...state,
    local: [...state.local, local],
    nextLocalId: state.nextLocalId + 1,
  }
}

export function resolveLocalEvent(
  state: EventsState,
  localId: string,
  stored: EventRecord,
): EventsState {
  return mergeEvents(
    { ...state, local: state.local.filter((e) => e.localId !== localId) },
    [stored],
  )
}

export function unseenErrorCount(state: EventsState, lastSeenSeq: number): number {
  const errors = state.events.filter(
    (event) => event.level === 'error' && event.seq > lastSeenSeq,
  )
  return errors.length + state.local.length
}

/** Newest first. Local rows lead, as they are the most recent failures. */
export function visibleRows(state: EventsState): EventRow[] {
  const local = [...state.local].reverse().map(
    (event): EventRow => ({
      key: event.localId,
      ts: event.ts,
      level: 'error',
      code: 'client.error',
      message: event.message,
      details: [],
      localOnly: true,
    }),
  )
  const stored = [...state.events].reverse().map(
    (event): EventRow => ({
      key: `seq-${event.seq}`,
      ts: event.ts,
      level: event.level,
      code: event.code,
      message: event.message,
      details: event.details,
      localOnly: false,
    }),
  )
  return [...local, ...stored]
}
