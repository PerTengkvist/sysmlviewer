const STORAGE_KEY = 'sysmlviewer.browserSessionId'

/** Stable id for this browser tab/window (sessionStorage). */
export function getBrowserSessionId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return `sess-fallback-${Date.now()}`
  }
}
