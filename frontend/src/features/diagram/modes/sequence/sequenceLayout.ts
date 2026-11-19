import { CHAR_PX, camelCaseSegments, lifelineHeaderHeight } from './camelWrap'

import type { SequenceLayout } from '../../../../api'

/** Persisted per view (`sequenceLayout`); absent parts mean "use defaults". */
export type SequenceLayoutSetting = SequenceLayout

export type SequenceMessage = {
  sourceId: string
  targetId: string
  label: string
}

/** Space between neighbouring lifeline boxes. */
export const LIFELINE_GAP = 28
/** Left edge of the first lifeline. */
export const LIFELINE_LEFT = 40
/** Same top for every lifeline. */
export const LIFELINE_TOP = 40
/** Padding on both sides of a message label between two centre axes. */
const LABEL_PAD = 24
/** Header chrome (matches camelWrap: inner = width - 16) plus visual margin. */
const HEADER_INSET = 16
const TEXT_MARGIN = 14
const STEREOTYPE_CHARS = '«lifeline»'.length
const MIN_DEFAULT_WIDTH = 80
const MIN_WIDTH_FLOOR = 56

function textPx(chars: number): number {
  return chars * CHAR_PX
}

/** Width that holds the name on one line plus a little margin. */
export function defaultLifelineWidth(name: string): number {
  const chars = Math.max(name.length, STEREOTYPE_CHARS)
  return Math.max(
    MIN_DEFAULT_WIDTH,
    Math.ceil(textPx(chars) + HEADER_INSET + TEXT_MARGIN),
  )
}

/** Narrowest width: the widest camelCase segment still fits on its own line. */
export function minLifelineWidth(name: string): number {
  const parts = camelCaseSegments(name)
  const longest = Math.max(
    STEREOTYPE_CHARS * 0.8,
    ...(parts.length > 0 ? parts : [name]).map((p) => p.length),
  )
  return Math.max(MIN_WIDTH_FLOOR, Math.ceil(textPx(longest) + HEADER_INSET + TEXT_MARGIN))
}

export function resolveLifelineWidth(name: string, saved: number | undefined): number {
  if (saved === undefined || !Number.isFinite(saved)) return defaultLifelineWidth(name)
  return Math.max(minLifelineWidth(name), saved)
}

/**
 * Left-to-right order from the first message each lifeline sends or receives;
 * lifelines without messages go last in declaration order.
 */
export function defaultLifelineOrder(
  lifelineIds: string[],
  messages: SequenceMessage[],
): string[] {
  const known = new Set(lifelineIds)
  const order: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }
  for (const m of messages) {
    add(m.sourceId)
    add(m.targetId)
  }
  for (const id of lifelineIds) add(id)
  return order
}

/** Saved order restricted to existing lifelines; new ones follow in default order. */
export function resolveLifelineOrder(
  defaultOrder: string[],
  saved: string[] | undefined,
): string[] {
  if (!saved?.length) return [...defaultOrder]
  const known = new Set(defaultOrder)
  const order = [...new Set(saved)].filter((id) => known.has(id))
  const have = new Set(order)
  return [...order, ...defaultOrder.filter((id) => !have.has(id))]
}

/** Left x per lifeline, packed on one line; gap grows where labels need room. */
export function packLifelines(
  order: string[],
  widths: Record<string, number>,
  messages: SequenceMessage[],
): Record<string, number> {
  const pos = new Map(order.map((id, i) => [id, i]))
  const labelNeed: number[] = order.map(() => 0)
  for (const m of messages) {
    const s = pos.get(m.sourceId)
    const t = pos.get(m.targetId)
    if (s === undefined || t === undefined || Math.abs(s - t) !== 1) continue
    const left = Math.min(s, t)
    labelNeed[left] = Math.max(labelNeed[left], textPx(m.label.length) + LABEL_PAD)
  }
  const xs: Record<string, number> = {}
  let x = LIFELINE_LEFT
  order.forEach((id, i) => {
    xs[id] = x
    const next = order[i + 1]
    if (next === undefined) return
    const w = widths[id] ?? 0
    const wNext = widths[next] ?? 0
    // Distance between the two centre axes.
    const centreDistance = Math.max((w + wNext) / 2 + LIFELINE_GAP, labelNeed[i])
    x += w / 2 + centreDistance - wNext / 2
  })
  return xs
}

/** New order after dropping `id` with its centre at `droppedCentreX`. */
export function orderAfterDrop(
  order: string[],
  id: string,
  droppedCentreX: number,
  centres: Record<string, number>,
): string[] {
  const others = order.filter((o) => o !== id)
  let index = others.findIndex((o) => (centres[o] ?? 0) > droppedCentreX)
  if (index < 0) index = others.length
  return [...others.slice(0, index), id, ...others.slice(index)]
}

export type SequenceLayoutResult = {
  order: string[]
  widths: Record<string, number>
  xs: Record<string, number>
}

/** Order, widths and x positions for the lifelines of one sequence view. */
export function layoutSequence(
  lifelines: { id: string; name: string }[],
  messages: SequenceMessage[],
  saved: SequenceLayoutSetting | null | undefined,
): SequenceLayoutResult {
  const ids = lifelines.map((l) => l.id)
  const order = resolveLifelineOrder(defaultLifelineOrder(ids, messages), saved?.order)
  const widths: Record<string, number> = {}
  for (const ll of lifelines) {
    widths[ll.id] = resolveLifelineWidth(ll.name, saved?.widths?.[ll.id])
  }
  return { order, widths, xs: packLifelines(order, widths, messages) }
}

/** Lifeline names in; shared header height and per-lifeline box out. */
export function sequenceGeometry(
  lifelines: { id: string; name: string }[],
  messages: SequenceMessage[],
  saved: SequenceLayoutSetting | null | undefined,
): SequenceLayoutResult & { headerHeight: number } {
  const layout = layoutSequence(lifelines, messages, saved)
  const headerHeight = lifelines.reduce(
    (tallest, ll) =>
      Math.max(tallest, lifelineHeaderHeight(ll.name, layout.widths[ll.id])),
    48,
  )
  return { ...layout, headerHeight }
}
