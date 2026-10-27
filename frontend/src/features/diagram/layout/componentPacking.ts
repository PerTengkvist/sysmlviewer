/**
 * Arrange disconnected components (yEd "component arrangement"): shelf-pack
 * component bounding boxes into rows aiming at a target aspect ratio.
 * Larger (connected) components come first; singletons fill the tail.
 */

export type ComponentBox = { id: string; w: number; h: number }

export type PackedComponents = {
  positions: Record<string, { x: number; y: number }>
  width: number
  height: number
}

export function packComponents(
  boxes: ComponentBox[],
  opts: { aspectRatio?: number; gap?: number } = {},
): PackedComponents {
  const gap = opts.gap ?? 48
  const aspect = Math.max(0.25, opts.aspectRatio ?? 1)
  const positions: Record<string, { x: number; y: number }> = {}
  if (!boxes.length) return { positions, width: 0, height: 0 }

  const ordered = [...boxes].sort((a, b) => {
    const d = b.w * b.h - a.w * a.h
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
  const totalArea = ordered.reduce((s, b) => s + (b.w + gap) * (b.h + gap), 0)
  const widest = Math.max(...ordered.map((b) => b.w))
  const targetWidth = Math.max(widest, Math.sqrt(totalArea * aspect))

  let x = 0
  let y = 0
  let rowH = 0
  let width = 0
  for (const b of ordered) {
    if (x > 0 && x + b.w > targetWidth) {
      x = 0
      y += rowH + gap
      rowH = 0
    }
    positions[b.id] = { x, y }
    x += b.w + gap
    rowH = Math.max(rowH, b.h)
    width = Math.max(width, x - gap)
  }
  return { positions, width, height: y + rowH }
}

/** Connected components over `ids` given undirected links (sorted, deterministic). */
export function connectedComponents(
  ids: string[],
  links: { a: string; b: string }[],
): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    let cur = x
    while (parent.get(cur) !== r) {
      const next = parent.get(cur)!
      parent.set(cur, r)
      cur = next
    }
    return r
  }
  for (const id of ids) parent.set(id, id)
  for (const l of links) {
    if (!parent.has(l.a) || !parent.has(l.b)) continue
    const ra = find(l.a)
    const rb = find(l.b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const groups = new Map<string, string[]>()
  for (const id of [...ids].sort()) {
    const r = find(id)
    groups.set(r, [...(groups.get(r) || []), id])
  }
  return [...groups.values()].sort((g1, g2) => {
    if (g2.length !== g1.length) return g2.length - g1.length
    return g1[0].localeCompare(g2[0])
  })
}
