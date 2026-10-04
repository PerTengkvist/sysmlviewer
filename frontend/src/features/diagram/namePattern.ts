/**
 * Glob-style name matching: only `*` is a wildcard; other characters are literal.
 * Matching is case-sensitive.
 */
export function matchName(pattern: string, name: string): boolean {
  if (pattern === '*') return true
  let regexSrc = ''
  for (const ch of pattern) {
    if (ch === '*') {
      regexSrc += '.*'
    } else {
      regexSrc += escapeRegex(ch)
    }
  }
  return new RegExp(`^${regexSrc}$`).test(name)
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
