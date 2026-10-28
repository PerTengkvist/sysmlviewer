const ELLIPSIS = '…'

/**
 * Keep the end of a filesystem path within `maxChars` characters.
 * Whole leading segments are dropped and replaced by `…<sep>`; if the last
 * segment alone does not fit it is cut from the left with a bare `…`.
 */
export function pathTail(path: string, maxChars: number): string {
  if (path.length <= maxChars) return path
  const lastSlash = path.lastIndexOf('/')
  const lastBackslash = path.lastIndexOf('\\')
  const sep = lastBackslash > lastSlash ? '\\' : '/'
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed.length <= maxChars) return trimmed
  const segments = trimmed.split(/[/\\]/).filter(Boolean)
  const last = segments[segments.length - 1] ?? trimmed
  const budget = Math.max(1, maxChars)
  let tail = ''
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const candidate = `${ELLIPSIS}${sep}${segments.slice(i).join(sep)}`
    if (candidate.length > budget) break
    tail = candidate
  }
  if (tail) return tail
  return `${ELLIPSIS}${last.slice(Math.max(0, last.length - (budget - 1)))}`
}
