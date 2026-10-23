/**
 * Pure keyboard → action mapping for the diagram canvas toolbar shortcuts.
 */

export type CanvasShortcutAction = 'undo' | 'redo' | 'selectAll'

export type CanvasShortcutHandlers = {
  undo: () => void
  redo: () => void
  selectAll: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!el.isContentEditable
}

/** Collect all node and edge ids for Ctrl/Cmd+A. */
export function allDiagramIds(nodes: { id: string }[], edges: { id: string }[]): string[] {
  return [...nodes.map((n) => n.id), ...edges.map((e) => e.id)]
}

/**
 * Handle canvas shortcuts. Returns the action taken, or null if ignored.
 * Uses Ctrl or Meta (Cmd). Ignores events from editable fields.
 */
export function handleCanvasShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target' | 'preventDefault'>,
  handlers: CanvasShortcutHandlers,
): CanvasShortcutAction | null {
  if (isEditableTarget(e.target)) return null
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return null
  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    handlers.undo()
    return 'undo'
  }
  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    handlers.redo()
    return 'redo'
  }
  if (key === 'a') {
    e.preventDefault()
    handlers.selectAll()
    return 'selectAll'
  }
  return null
}
