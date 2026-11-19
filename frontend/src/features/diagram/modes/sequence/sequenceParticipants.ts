import type { SemanticElement } from '../../../../api'

export type SequenceParticipants = {
  /** Lifelines in first-appearance order (the layout orders them from here). */
  lifelines: SemanticElement[]
  /** Messages of the root in declaration order. */
  messages: SemanticElement[]
}

/**
 * Who is on the lifelines of a sequence view.
 *
 * - Under an `interaction` root they are the `lifeline` elements (legacy form).
 * - Under an `occurrence` root a lifeline is not declared: it is a part that a
 *   message uses as its source or target. Parts that no message mentions are
 *   not drawn, and ends that are not parts in the payload are ignored.
 *
 * `semantic` arrives in declaration order, so messages are used as they come
 * (an id such as msg10 must not be re-sorted).
 */
export function sequenceParticipants(
  semantic: Record<string, SemanticElement>,
  rootId: string,
): SequenceParticipants {
  const messages = Object.values(semantic).filter(
    (e) => e.kind === 'message' && e.parentId === rootId,
  )
  if (semantic[rootId]?.kind !== 'occurrence') {
    const lifelines = Object.values(semantic).filter(
      (e) => e.kind === 'lifeline' && e.parentId === rootId,
    )
    return { lifelines, messages }
  }
  const lifelines: SemanticElement[] = []
  const seen = new Set<string>()
  for (const msg of messages) {
    for (const end of [msg.sourceId, msg.targetId]) {
      if (!end || seen.has(end)) continue
      const part = semantic[end]
      if (part?.kind !== 'part') continue
      seen.add(end)
      lifelines.push(part)
    }
  }
  return { lifelines, messages }
}

/** `#Reply message` and the older `#reply message` are drawn as replies. */
export function isReplyMessage(msg: SemanticElement): boolean {
  return (msg.metadataKeywords ?? []).some((k) => k.toLowerCase() === 'reply')
}

/** Short name of an event end: the element's name, else the id's last segment. */
export function eventName(
  semantic: Record<string, SemanticElement>,
  eventId: string | null | undefined,
): string | undefined {
  if (!eventId) return undefined
  return semantic[eventId]?.name || eventId.split('::').pop() || undefined
}
