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
  return Object.fromEntries(list.map((e) => [e.id, e]))
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
    for (const e of [
      el({ id: 'P::S::plant', kind: 'part', parentId: 'P::S' }),
      el({ id: 'P::S::plant::actuator', kind: 'part', parentId: 'P::S::plant' }),
      el({
        id: 'P::S::m2',
        kind: 'message',
        parentId: 'P::S',
        sourceId: 'P::S::a',
        targetId: 'P::S::plant::actuator',
      }),
    ]) {
      semantic[e.id] = e
    }
    const { lifelines } = sequenceParticipants(semantic, 'P::S')
    expect(lifelines.map((l) => l.id)).toEqual(['P::S::b', 'P::S::a', 'P::S::plant::actuator'])
  })

  it('ignores ends that are not parts in the payload', () => {
    const semantic = occurrence()
    semantic['P::S::m2'] = el({
      id: 'P::S::m2',
      kind: 'message',
      parentId: 'P::S',
      sourceId: 'P::S::zz',
      targetId: 'P::S::m1',
    })
    const { lifelines } = sequenceParticipants(semantic, 'P::S')
    expect(lifelines.map((l) => l.id)).toEqual(['P::S::b', 'P::S::a'])
  })

  it('keeps messages in declaration order (m10 after m9)', () => {
    const semantic = occurrence()
    for (let i = 2; i <= 11; i++) {
      semantic[`P::S::m${i}`] = el({
        id: `P::S::m${i}`,
        kind: 'message',
        parentId: 'P::S',
        sourceId: 'P::S::a',
        targetId: 'P::S::b',
      })
    }
    const { messages } = sequenceParticipants(semantic, 'P::S')
    expect(messages.map((m) => m.name)).toEqual(
      Array.from({ length: 11 }, (_, i) => `m${i + 1}`),
    )
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
