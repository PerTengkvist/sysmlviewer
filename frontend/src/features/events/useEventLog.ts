import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type ClientEvent } from '../../api'
import {
  addLocalEvent,
  emptyEventsState,
  latestSeq,
  mergeEvents,
  resolveLocalEvent,
  unseenErrorCount,
  visibleRows,
} from './eventsState'

const POLL_MS = 5000

/** Event log state for the open project. The backend log is the source. */
export function useEventLog(projectId: string | null) {
  const [state, setState] = useState(emptyEventsState)
  const [open, setOpen] = useState(false)
  const [lastSeenSeq, setLastSeenSeq] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const deliverLocalEvents = useCallback(async () => {
    if (!projectId) return
    for (const local of stateRef.current.local) {
      const stored = await api.postClientEvent(projectId, {
        message: local.message,
        viewId: local.viewId,
        viewName: local.viewName,
      })
      setState((s) => resolveLocalEvent(s, local.localId, stored))
    }
  }, [projectId])

  const refresh = useCallback(async () => {
    if (!projectId) return
    try {
      const { events } = await api.getEvents(projectId, latestSeq(stateRef.current))
      setState((s) => mergeEvents(s, events))
      await deliverLocalEvents()
    } catch {
      // Unreachable backend: the drawer keeps what it has and tries again.
    }
  }, [projectId, deliverLocalEvents])

  const report = useCallback(
    async (event: ClientEvent) => {
      if (!projectId) return
      try {
        const stored = await api.postClientEvent(projectId, event)
        setState((s) => mergeEvents(s, [stored]))
      } catch {
        setState((s) => addLocalEvent(s, event))
      }
    },
    [projectId],
  )

  // Events from earlier sessions are in the drawer but not news.
  useEffect(() => {
    setState(emptyEventsState())
    setLastSeenSeq(0)
    if (!projectId) return
    let cancelled = false
    void api
      .getEvents(projectId)
      .then(({ events }) => {
        if (cancelled) return
        setState((s) => mergeEvents(s, events))
        setLastSeenSeq(events.at(-1)?.seq ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [open, refresh])

  useEffect(() => {
    if (open) setLastSeenSeq(latestSeq(state))
  }, [open, state])

  return {
    rows: visibleRows(state),
    unseenErrors: open ? 0 : unseenErrorCount(state, lastSeenSeq),
    open,
    setOpen,
    refresh,
    report,
  }
}
