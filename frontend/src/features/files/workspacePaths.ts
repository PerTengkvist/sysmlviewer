/** Path helpers for workspace dialogs (backend owns real FS access). */

export function normalizeFolderPath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.replace(/[/\\]+$/, '')
}

export function normalizeRelSysmlPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return null
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.some((p) => p === '..')) return null
  return parts.join('/')
}
