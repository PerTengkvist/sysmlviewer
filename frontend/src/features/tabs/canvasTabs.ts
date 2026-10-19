export type CanvasTabKind = 'diagram' | 'markdown' | 'tutorial'

export type CanvasTab =
  | { id: string; kind: 'diagram'; viewId: string; title: string }
  | { id: string; kind: 'markdown'; docPath: string; title: string }
  | { id: string; kind: 'tutorial'; tutorialId: string; title: string }

export type CanvasTabsState = {
  tabs: CanvasTab[]
  activeId: string | null
}

export function emptyTabs(): CanvasTabsState {
  return { tabs: [], activeId: null }
}

function diagramTabId(viewId: string): string {
  return `diagram:${viewId}`
}

function markdownTabId(docPath: string): string {
  return `markdown:${docPath}`
}

export function openDiagramSameTab(
  state: CanvasTabsState,
  viewId: string,
  title: string,
): CanvasTabsState {
  const id = diagramTabId(viewId)
  if (!state.tabs.length || !state.activeId) {
    const tab: CanvasTab = { id, kind: 'diagram', viewId, title }
    return { tabs: [tab], activeId: id }
  }
  const active = state.tabs.find((t) => t.id === state.activeId)
  if (!active) {
    const tab: CanvasTab = { id, kind: 'diagram', viewId, title }
    return { tabs: [...state.tabs, tab], activeId: id }
  }
  const nextTab: CanvasTab = { id, kind: 'diagram', viewId, title }
  const tabs = state.tabs.map((t) => (t.id === active.id ? nextTab : t))
  // If another tab already has this view, reuse it
  const existing = state.tabs.find(
    (t) => t.kind === 'diagram' && t.viewId === viewId && t.id !== active.id,
  )
  if (existing) {
    return { tabs: state.tabs, activeId: existing.id }
  }
  return { tabs, activeId: id }
}

export function openDiagramNewTab(
  state: CanvasTabsState,
  viewId: string,
  title: string,
): CanvasTabsState {
  const id = diagramTabId(viewId)
  const existing = state.tabs.find((t) => t.id === id)
  if (existing) {
    return { ...state, activeId: existing.id }
  }
  const tab: CanvasTab = { id, kind: 'diagram', viewId, title }
  return { tabs: [...state.tabs, tab], activeId: id }
}

export function openMarkdownNewTab(
  state: CanvasTabsState,
  docPath: string,
  title: string,
): CanvasTabsState {
  const id = markdownTabId(docPath)
  const existing = state.tabs.find((t) => t.id === id)
  if (existing) {
    return { ...state, activeId: existing.id }
  }
  const tab: CanvasTab = { id, kind: 'markdown', docPath, title }
  return { tabs: [...state.tabs, tab], activeId: id }
}

function tutorialTabId(tutorialId: string): string {
  return `tutorial:${tutorialId}`
}

export function openTutorialNewTab(
  state: CanvasTabsState,
  tutorialId: string,
  title: string,
): CanvasTabsState {
  const id = tutorialTabId(tutorialId)
  const existing = state.tabs.find((t) => t.id === id)
  if (existing) {
    return { ...state, activeId: existing.id }
  }
  const tab: CanvasTab = { id, kind: 'tutorial', tutorialId, title }
  return { tabs: [...state.tabs, tab], activeId: id }
}

export function activateTab(
  state: CanvasTabsState,
  tabId: string,
): CanvasTabsState {
  if (!state.tabs.some((t) => t.id === tabId)) return state
  return { ...state, activeId: tabId }
}

export function closeTab(
  state: CanvasTabsState,
  tabId: string,
): CanvasTabsState {
  const idx = state.tabs.findIndex((t) => t.id === tabId)
  if (idx < 0) return state
  const tabs = state.tabs.filter((t) => t.id !== tabId)
  if (!tabs.length) return emptyTabs()
  if (state.activeId !== tabId) return { tabs, activeId: state.activeId }
  const neighbor = tabs[Math.min(idx, tabs.length - 1)]
  return { tabs, activeId: neighbor.id }
}

export function activeTab(state: CanvasTabsState): CanvasTab | null {
  if (!state.activeId) return null
  return state.tabs.find((t) => t.id === state.activeId) ?? null
}
