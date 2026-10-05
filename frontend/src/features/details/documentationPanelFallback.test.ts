import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  DEFAULT_REQUIREMENT_DISPLAY,
  resolveRequirementDocPanel,
} from '../diagram/requirementDisplay'

/** Contract for DocumentationPanel attribute fallback (no .md). */
describe('documentation panel requirement fallback', () => {
  const el: SemanticElement = {
    id: 'P::R',
    kind: 'requirement',
    name: 'Safety',
    parentId: 'P',
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: ['P::R::description'],
    fileId: null,
    shortId: 'R-01',
  }
  const semantic = {
    'P::R': el,
    'P::R::description': {
      id: 'P::R::description',
      kind: 'attribute' as const,
      name: 'description',
      parentId: 'P::R',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [] as string[],
      fileId: null,
      defaultValue: '"Panel text"',
    },
  }

  it('shows description attribute when no md file', () => {
    expect(
      resolveRequirementDocPanel(el, semantic, DEFAULT_REQUIREMENT_DISPLAY, false),
    ).toBe('Panel text')
  })

  it('skips attribute fallback when md exists', () => {
    expect(
      resolveRequirementDocPanel(el, semantic, DEFAULT_REQUIREMENT_DISPLAY, true),
    ).toBeNull()
  })

  it('shows nothing when documentationPanelAttribute is disabled', () => {
    expect(
      resolveRequirementDocPanel(
        el,
        semantic,
        { ...DEFAULT_REQUIREMENT_DISPLAY, documentationPanelAttribute: null },
        false,
      ),
    ).toBeNull()
  })
})
