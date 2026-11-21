import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { eventName, isReplyMessage, sequenceParticipants } from './sequenceParticipants'

function el(partial: Partial<SemanticElement> & { id: string; kind: SemanticElement['kind'] }): SemanticElement {
  return {
    name: partial.id.split('::').pop()!,
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...partial,
  }
}

function occurrence(): Record<string, SemanticElement> {
  const list = [
    el({ id: 'P::S', kind: 'occurrence', parentId: 'P' }),
    el({ id: 'P::S::a', kind: 'part', parentId: 'P::S' }),
    el({ id: 'P::S::b', kind: 'part', parentId: 'P::S' }),
    el({ id: 'P::S::unused', kind: 'part', parentId: 'P::S' }),
    el({ id: 'P::S::m1', kind: 'message', parentId: 'P::S', sourceId: 'P::S::b', targetId: 'P::S::a' }),
  ]
  list[0].children = list.slice(1).map((e) => e.id)
  return Object.fromEntries(list.map((e) => [e.id, e]))
}

/** Add elements under the occurrence root and list them as its children. */
function addToRoot(semantic: Record<string, SemanticElement>, ...els: SemanticElement[]) {
  for (const e of els) semantic[e.id] = e
  semantic['P::S'] = { ...semantic['P::S'], children: [...semantic['P::S'].children, ...els.map((e) => e.id)] }
}

describe('sequenceParticipants', () => {
  it('uses lifeline elements under an interaction root', () => {
    const semantic = Object.fromEntries(
      [
        el({ id: 'P::I', kind: 'interaction' }),
        el({ id: 'P::I::A', kind: 'lifeline', parentId: 'P::I' }),
        el({ id: 'P::I::B', kind: 'lifeline', parentId: 'P::I' }),
        el({ id: 'P::I::C', kind: 'lifeline', parentId: 'P::I' }),
        el({ id: 'P::I::msg1', kind: 'message', parentId: 'P::I', sourceId: 'P::I::A', targetId: 'P::I::B' }),
      ].map((e) => [e.id, e]),
    )
    const { lifelines, messages } = sequenceParticipants(semantic, 'P::I')
    // an unused legacy lifeline is still drawn
    expect(lifelines.map((l) => l.id)).toEqual(['P::I::A', 'P::I::B', 'P::I::C'])
    expect(messages).toHaveLength(1)
  })

  it('derives lifelines from message ends under an occurrence root', () => {
    const { lifelines } = sequenceParticipants(occurrence(), 'P::S')
    expect(lifelines.map((l) => l.id)).toEqual(['P::S::b', 'P::S::a'])
  })

  it('accepts nested and materialized parts as lifelines', () => {
    const semantic = occurrence()
    addToRoot(
      semantic,
      el({ id: 'P::S::plant', kind: 'part', parentId: 'P::S' }),
      el({ id: 'P::S::plant::actuator', kind: 'part', parentId: 'P::S::plant' }),
      el({
        id: 'P::S::m2',
        kind: 'message',
        parentId: 'P::S',
        sourceId: 'P::S::a',
        targetId: 'P::S::plant::actuator',
      }),
    )
    const { lifelines } = sequenceParticipants(semantic, 'P::S')
    expect(lifelines.map((l) => l.id)).toEqual(['P::S::b', 'P::S::a', 'P::S::plant::actuator'])
  })

  it('ignores ends that are not parts in the payload', () => {
    const semantic = occurrence()
    addToRoot(
      semantic,
      el({
        id: 'P::S::m2',
        kind: 'message',
        parentId: 'P::S',
        sourceId: 'P::S::zz',
        targetId: 'P::S::m1',
      }),
    )
    const { lifelines } = sequenceParticipants(semantic, 'P::S')
    expect(lifelines.map((l) => l.id)).toEqual(['P::S::b', 'P::S::a'])
  })

  it('keeps messages in declaration order (m10 after m9)', () => {
    const semantic = occurrence()
    for (let i = 2; i <= 11; i++) {
      addToRoot(
        semantic,
        el({
          id: `P::S::m${i}`,
          kind: 'message',
          parentId: 'P::S',
          sourceId: 'P::S::a',
          targetId: 'P::S::b',
        }),
      )
    }
    const { messages } = sequenceParticipants(semantic, 'P::S')
    expect(messages.map((m) => m.name)).toEqual(
      Array.from({ length: 11 }, (_, i) => `m${i + 1}`),
    )
  })

  it('orders occurrence messages by the root children, not by dict order', () => {
    const semantic = occurrence()
    // a#2 is declared before z but sits after it in the dict
    const z = el({ id: 'P::S::z', kind: 'message', parentId: 'P::S', sourceId: 'P::S::a', targetId: 'P::S::b' })
    const a2 = el({ id: 'P::S::a#2', kind: 'message', name: 'a', parentId: 'P::S', sourceId: 'P::S::a', targetId: 'P::S::b' })
    semantic['P::S::z'] = z
    semantic['P::S::a#2'] = a2
    semantic['P::S'] = { ...semantic['P::S'], children: ['P::S::m1', 'P::S::a#2', 'P::S::z'] }
    const { messages } = sequenceParticipants(semantic, 'P::S')
    expect(messages.map((m) => m.id)).toEqual(['P::S::m1', 'P::S::a#2', 'P::S::z'])
  })
})

describe('isReplyMessage / eventName', () => {
  it('treats #Reply and #reply alike', () => {
    expect(isReplyMessage(el({ id: 'm', kind: 'message', metadataKeywords: ['Reply'] }))).toBe(true)
    expect(isReplyMessage(el({ id: 'm', kind: 'message', metadataKeywords: ['reply'] }))).toBe(true)
    expect(isReplyMessage(el({ id: 'm', kind: 'message' }))).toBe(false)
  })

  it('names an event from the payload or from its id', () => {
    const semantic = { 'P::A::sent': el({ id: 'P::A::sent', kind: 'eventOccurrence' }) }
    expect(eventName(semantic, 'P::A::sent')).toBe('sent')
    expect(eventName(semantic, 'P::S::a::ping')).toBe('ping')
    expect(eventName(semantic, null)).toBeUndefined()
  })
})
