export type OpenTargetChoice = 'same-tab' | 'new-tab' | 'new-window'

export type OpenTargetRequest = {
  viewId: string
  /** True when the user held Ctrl (or Meta on macOS). */
  modifier: boolean
}

/** Plain click → same tab, no menu. Ctrl/Meta → show menu choices. */
export function openTargetDecision(
  req: OpenTargetRequest,
): { showMenu: false; choice: 'same-tab' } | { showMenu: true } {
  if (!req.modifier) {
    return { showMenu: false, choice: 'same-tab' }
  }
  return { showMenu: true }
}

/** Build a same-origin URL that opens the given view in a new window. */
export function viewWindowUrl(
  viewId: string,
  origin?: string,
  pathname?: string,
): string {
  const base =
    origin ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  const path =
    pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '/')
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`)
  url.searchParams.set('view', viewId)
  return url.toString()
}

export function viewIdFromLocationSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  return params.get('view')
}
