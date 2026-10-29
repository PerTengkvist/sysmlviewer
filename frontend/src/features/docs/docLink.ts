/** True for relative project markdown links; false for external / fragment / non-md. */
export function isInternalDocHref(href: string | undefined | null): boolean {
  if (!href) return false
  const t = href.trim()
  if (!t || t.startsWith('#')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return false
  return /\.md$/i.test(t)
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(0, slash) : ''
}

/** Join and normalize `.` / `..`; return null if the result escapes the project root. */
function normalizeProjectPath(parts: string[]): string | null {
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!out.length) return null
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

/**
 * Resolve a markdown link relative to the currently open documentation file.
 * Returns a project-relative path, or null when the href is not an internal doc link.
 */
export function resolveDocLink(
  currentDocPath: string,
  href: string | undefined | null,
): string | null {
  if (!isInternalDocHref(href)) return null
  const raw = (href as string).trim()
  const base = dirname(currentDocPath)
  const joined = base ? `${base}/${raw}` : raw
  return normalizeProjectPath(joined.split('/'))
}
