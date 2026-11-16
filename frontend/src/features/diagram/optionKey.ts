import { useEffect, useState } from 'react'

/**
 * Option (Alt) held: the diagrams show their connection handles (and the
 * structure diagrams switch to moving ports) only while it is down.
 */

export function isOptionKey(e: { key?: string; code?: string }): boolean {
  return e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight'
}

type VisibilityTarget = EventTarget & { visibilityState?: string }

/**
 * Call `onChange(true)` when Option goes down and `onChange(false)` when it
 * comes up, the window loses focus or the page is hidden (a released key is
 * then never seen). Returns the cleanup.
 */
export function trackOptionKey(
  onChange: (held: boolean) => void,
  win: EventTarget = window,
  doc: VisibilityTarget = document,
): () => void {
  const down = (e: Event) => {
    if (isOptionKey(e as KeyboardEvent)) onChange(true)
  }
  const up = (e: Event) => {
    if (isOptionKey(e as KeyboardEvent)) onChange(false)
  }
  const release = () => onChange(false)
  const visibility = () => {
    if (doc.visibilityState === 'hidden') onChange(false)
  }
  win.addEventListener('keydown', down)
  win.addEventListener('keyup', up)
  win.addEventListener('blur', release)
  doc.addEventListener('visibilitychange', visibility)
  return () => {
    win.removeEventListener('keydown', down)
    win.removeEventListener('keyup', up)
    win.removeEventListener('blur', release)
    doc.removeEventListener('visibilitychange', visibility)
  }
}

/** Whether Option is held right now. */
export function useOptionKeyHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => trackOptionKey(setHeld), [])
  return held
}

/** Class on a diagram root that shows its connection handles (`.flow-handle`). */
export function handleVisibilityClass(optionHeld: boolean): string {
  return optionHeld ? 'show-handles' : ''
}
