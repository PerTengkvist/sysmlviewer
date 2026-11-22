import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { flowNodeTarget } from './flowNodeTarget'

const el = (
  id: string,
  extra: Partial<SemanticElement> = {},
): SemanticElement => ({
  id,
  kind: 'action',
  name: id.split('::').pop() ?? id,
  parentId: null,
  typeRef: null,
  sourceId: null,
  targetId: null,
  children: [],
  fileId: 'f',
  ...extra,
})

const semantic: Record<string, SemanticElement> = {
  'UC::step': el('UC::step', { parentId: 'UC' }),
  'UC::start': el('UC::start', { typeRef: 'start', parentId: 'UC' }),
  'UC::link': el('UC::link', {
    metadataKeywords: ['perform'],
    performTargetId: 'F::act',
    parentId: 'UC',
  }),
  'UC::loose': el('UC::loose', { metadataKeywords: ['perform'], parentId: 'UC' }),
  'Case::inner': el('Case::inner', { parentId: 'Case' }),
  'F::act': el('F::act'),
}

describe('flowNodeTarget', () => {
  it('opens a use case step', () => {
    expect(flowNodeTarget({ kind: 'action', artifactId: 'UC::step' }, semantic, 'UC')).toBe('UC::step')
  })

  it('does not open start, done and decision nodes', () => {
    for (const kind of ['start', 'done', 'decide', 'performCase']) {
      expect(flowNodeTarget({ kind, artifactId: 'UC::start' }, semantic, 'UC')).toBeNull()
    }
  })

  it('opens the perform target of an action link, not the perform usage', () => {
    expect(flowNodeTarget({ kind: 'actionLink', artifactId: 'UC::link' }, semantic, 'UC')).toBe('F::act')
    expect(flowNodeTarget({ kind: 'actionLink', artifactId: 'UC::loose' }, semantic, 'UC')).toBeNull()
  })

  it('ignores steps of an expanded case and unknown ids', () => {
    expect(flowNodeTarget({ kind: 'action', artifactId: 'Case::inner' }, semantic, 'UC')).toBeNull()
    expect(flowNodeTarget({ kind: 'action', artifactId: 'nope' }, semantic, 'UC')).toBeNull()
  })
})
