/** Nested port summary used for hover / annotations / details. */
export type NestedPortInfo = {
  name: string
  typeRef?: string | null
}

/** Format a port for hover: `name:type` or a nested block. Missing type → `—`. */
export function portHoverText(
  name: string,
  typeRef: string | null | undefined,
  nested: NestedPortInfo[] = [],
): string {
  const typeLabel = typeRef && typeRef.length > 0 ? typeRef : '—'
  const head = `${name}:${typeLabel}`
  if (!nested.length) return head
  const lines = nested.map((n) => {
    const t = n.typeRef && n.typeRef.length > 0 ? n.typeRef : '—'
    return `  ${n.name}:${t};`
  })
  return `${head} {\n${lines.join('\n')}\n}`
}

/** Annotation label listing nested port names only. Empty → null (no annotation). */
export function formatSubportsAnnotation(names: string[]): string | null {
  const cleaned = names.map((n) => n.trim()).filter(Boolean)
  if (!cleaned.length) return null
  return `subports:{${cleaned.join(', ')}}`
}
