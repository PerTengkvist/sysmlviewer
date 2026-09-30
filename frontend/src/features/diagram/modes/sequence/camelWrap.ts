/** Split a camelCase or PascalCase name before each internal capital. */
export function camelCaseSegments(name: string): string[] {
  if (!name) return []
  return name
    .split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .filter((part) => part.length > 0)
}

/** 0.75rem name, matching the lifeline header font (25% below 1rem). */
const NAME_LINE_PX = 16
const HEADER_CHROME_PX = 28
const CHAR_PX = 7.2
const MIN_HEADER_PX = 48

/**
 * Header height so a camelCase name can wrap at capitals inside `widthPx`
 * without covering the lifeline axis.
 */
export function lifelineHeaderHeight(name: string, widthPx: number): number {
  const inner = Math.max(32, widthPx - 16)
  const parts = camelCaseSegments(name)
  const text = parts.length > 0 ? parts : [name]
  let lines = 1
  let used = 0
  for (const part of text) {
    const width = part.length * CHAR_PX
    if (used > 0 && used + width > inner) {
      lines += 1
      used = width
    } else {
      used += width
    }
  }
  return Math.max(MIN_HEADER_PX, HEADER_CHROME_PX + lines * NAME_LINE_PX)
}
