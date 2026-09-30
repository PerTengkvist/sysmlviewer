/** Display stereotype for a requirement (without guillemets). */

function stripQuotes(value: string): string {
  const v = value.trim()
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * Stereotype text from an optional Type attribute value.
 * Missing Type → "requirement"; UserStory → "user story"; else lowercase.
 */
export function requirementStereotype(el: { typeAttr?: string | null }): string {
  const raw = el.typeAttr?.trim()
  if (!raw) return 'requirement'
  const value = stripQuotes(raw)
  if (!value) return 'requirement'
  if (value === 'UserStory') return 'user story'
  return value.toLowerCase()
}

type TypeAttrChild = {
  name: string
  kind?: string
  defaultValue?: string | null
}

/** Read the Type attribute default from a requirement's children. */
export function requirementTypeAttr(
  el: { children: string[] },
  semantic: Record<string, TypeAttrChild | undefined>,
): string | undefined {
  for (const cid of el.children) {
    const child = semantic[cid]
    if (child?.kind === 'attribute' && child.name === 'Type') {
      return child.defaultValue ?? undefined
    }
  }
  return undefined
}
