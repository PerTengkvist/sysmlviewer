import { describe, expect, it } from 'vitest'
import {
  activateTab,
  closeTab,
  emptyTabs,
  openDiagramNewTab,
  openDiagramSameTab,
  openMarkdownNewTab,
  openTutorialNewTab,
} from './canvasTabs'

describe('canvasTabs', () => {
  it('opens a diagram in the same tab by replacing content', () => {
    let s = openDiagramSameTab(emptyTabs(), 'v1', 'View 1')
    expect(s.tabs).toHaveLength(1)
    s = openDiagramSameTab(s, 'v2', 'View 2')
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0]).toMatchObject({ kind: 'diagram', viewId: 'v2' })
    expect(s.activeId).toBe('diagram:v2')
  })

  it('opens a diagram in a new tab and activates it', () => {
    let s = openDiagramSameTab(emptyTabs(), 'v1', 'View 1')
    s = openDiagramNewTab(s, 'v2', 'View 2')
    expect(s.tabs).toHaveLength(2)
    expect(s.activeId).toBe('diagram:v2')
  })

  it('reuses an existing tab for the same view id', () => {
    let s = openDiagramNewTab(emptyTabs(), 'v1', 'View 1')
    s = openDiagramNewTab(s, 'v2', 'View 2')
    s = openDiagramNewTab(s, 'v1', 'View 1 again')
    expect(s.tabs).toHaveLength(2)
    expect(s.activeId).toBe('diagram:v1')
  })

  it('closes the active tab and activates a neighbor', () => {
    let s = openDiagramNewTab(emptyTabs(), 'v1', 'View 1')
    s = openDiagramNewTab(s, 'v2', 'View 2')
    s = openDiagramNewTab(s, 'v3', 'View 3')
    s = activateTab(s, 'diagram:v2')
    s = closeTab(s, 'diagram:v2')
    expect(s.tabs.map((t) => t.id)).toEqual(['diagram:v1', 'diagram:v3'])
    expect(s.activeId).toBe('diagram:v3')
  })

  it('allows closing the last tab', () => {
    let s = openDiagramSameTab(emptyTabs(), 'v1', 'View 1')
    s = closeTab(s, 'diagram:v1')
    expect(s.tabs).toHaveLength(0)
    expect(s.activeId).toBeNull()
  })

  it('keeps markdown and diagram tabs as distinct kinds', () => {
    let s = openDiagramSameTab(emptyTabs(), 'v1', 'View 1')
    s = openMarkdownNewTab(s, 'docs/tutorials/a.md', 'Tutorial A')
    expect(s.tabs).toHaveLength(2)
    expect(s.tabs[0].kind).toBe('diagram')
    expect(s.tabs[1].kind).toBe('markdown')
    expect(s.activeId).toBe('markdown:docs/tutorials/a.md')
    // Same path id does not collide with a diagram view id string
    s = openDiagramNewTab(s, 'docs/tutorials/a.md', 'Weird view')
    expect(s.tabs).toHaveLength(3)
  })

  it('opens a tutorial in a new tab without replacing the diagram', () => {
    let s = openDiagramSameTab(emptyTabs(), 'v1', 'View 1')
    s = openTutorialNewTab(s, 'use-cases-and-scenarios', 'Use cases')
    expect(s.tabs).toHaveLength(2)
    expect(s.activeId).toBe('tutorial:use-cases-and-scenarios')
    expect(s.tabs[0].kind).toBe('diagram')
  })
})
