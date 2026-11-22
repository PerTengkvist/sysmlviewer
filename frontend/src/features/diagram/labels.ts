/**
 * Unambiguous labels for a list of model elements (decision B11).
 *
 * Port of `backend/src/domain/failure/labels.py` (`disambiguate` with the `name`, `label`
 * and `tail` styles); `labels.test.ts` repeats the cases of `test_failure_labels.py`.
 *
 * - `name`: the simple name (`authenticate`).
 * - `label`: `<short name> <name>` for tagged elements (`UC006 Brake`), else the name.
 * - `tail`: the id without its first (package) segment.
 *
 * Two or more elements with the same plain text each get the shortest suffix of their
 * qualified id, in whole `::` segments, that is unique (`Security::authenticate` and
 * `Comfort::authenticate`); the tag of `label` stays in front. Different elements may get
 * suffixes of different length. Ids are never affected.
 */

export type LabelStyle = 'name' | 'label' | 'tail'

export type LabelNode = { id: string; name: string; shortId?: string | null }

/** The last k + 1 whole segments of an id. */
function suffix(id: string, k: number): string {
  return id.split('::').slice(-(k + 1)).join('::')
}

function tailId(id: string): string {
  const at = id.indexOf('::')
  return at < 0 ? id : id.slice(at + 2)
}

/**
 * Make the texts of `base` (key -> plain text) unique among all keys. A key whose text is
 * shared is shown as `qual(key, k)`, with k growing one step at a time until the text is
 * unique among all keys, also against texts that were unique before. A key that cannot
 * grow further stays.
 */
export function disambiguate(
  base: ReadonlyMap<string, string>,
  qual: (key: string, k: number) => string,
): Map<string, string> {
  const out = new Map(base)
  const level = new Map<string, number>()
  for (const key of base.keys()) level.set(key, 0)
  for (;;) {
    const byText = new Map<string, string[]>()
    for (const [key, text] of out) {
      const keys = byText.get(text)
      if (keys) keys.push(key)
      else byText.set(text, [key])
    }
    let grew = false
    for (const keys of byText.values()) {
      if (keys.length < 2) continue
      for (const key of keys) {
        const from = level.get(key)! + 1
        const to = level.get(key)! + 2 + key.split('::').length
        for (let k = from; k < to; k++) {
          const text = qual(key, k)
          if (text !== out.get(key)) {
            level.set(key, k)
            out.set(key, text)
            grew = true
            break
          }
        }
      }
    }
    if (!grew) return out
  }
}

/** Labels of `nodes` (id -> label) in one style, unique among them. */
export function labelMap(
  nodes: readonly LabelNode[],
  style: LabelStyle,
): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const base = new Map<string, string>()
  for (const n of nodes) {
    base.set(
      n.id,
      style === 'name'
        ? n.name
        : style === 'label'
          ? n.shortId
            ? `${n.shortId} ${n.name}`
            : n.name
          : tailId(n.id),
    )
  }
  return disambiguate(base, (id, k) => {
    if (style === 'tail') return k >= 1 ? id : tailId(id)
    if (style === 'label') {
      const tag = byId.get(id)?.shortId
      return tag ? `${tag} ${suffix(id, k)}` : suffix(id, k)
    }
    return suffix(id, k)
  })
}

/** Ids without their package segment; the full id where two of `ids` would look alike. */
export function tailNames(ids: readonly string[]): Map<string, string> {
  return labelMap(
    ids.map((id) => ({ id, name: id })),
    'tail',
  )
}
