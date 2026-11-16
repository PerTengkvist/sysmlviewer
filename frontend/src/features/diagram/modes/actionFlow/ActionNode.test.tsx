import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { ActionNode, type ActionNodeData } from './ActionNode'

function render(data: Partial<ActionNodeData>): string {
  const props = {
    id: 'n1',
    data: { label: 'n1', artifactId: 'n1', viewMode: 'light', ...data },
    selected: false,
  } as unknown as NodeProps
  return renderToStaticMarkup(
    createElement(ReactFlowProvider, null, createElement(ActionNode, props)),
  )
}

/** Handle ids in DOM order with their type and side. */
function handles(html: string): string[] {
  return [...html.matchAll(/<div[^>]*data-handleid="([^"]+)"[^>]*>/g)].map((m) => {
    const tag = m[0]
    const type = tag.includes(' source') ? 'source' : 'target'
    const side = /react-flow__handle-(left|right|top|bottom)/.exec(tag)?.[1]
    return `${m[1]}:${type}:${side}`
  })
}

describe('ActionNode handles', () => {
  it('an action has a right-side input for a loop back, after its other handles', () => {
    expect(handles(render({}))).toEqual([
      'out:source:right',
      'in:target:left',
      'bottom:source:bottom',
      'top:target:top',
      'in-right:target:right',
    ])
  })

  it('a decision has a right-side input after its other handles', () => {
    const ids = handles(render({ isDecision: true }))
    expect(ids.slice(0, 6)).toEqual([
      'in-top:target:top',
      'in-left:target:left',
      'out-bottom:source:bottom',
      'out-left:source:left',
      'out-right:source:right',
      'out-top:source:top',
    ])
    expect(ids[6]).toBe('in-right:target:right')
  })

  it('done has a right-side input after its other handles', () => {
    const ids = handles(render({ isDone: true }))
    expect(ids.slice(0, 4)).toEqual([
      'in:target:left',
      'top:target:top',
      'out:source:right',
      'bottom:source:bottom',
    ])
    expect(ids[4]).toBe('in-right:target:right')
  })
})

describe('ActionNode performer', () => {
  it('shows who performs the action under its name', () => {
    const html = render({ label: 'Check Credential', performedBy: ['authenticate'] })
    expect(html).toMatch(/<span class="action-performer"[^>]*>⟨authenticate⟩<\/span>/)
  })

  it('joins several performers', () => {
    const html = render({ label: 'Step', performedBy: ['a', 'b'] })
    expect(html).toContain('⟨a, b⟩')
  })

  it('has no performer row without performers', () => {
    expect(render({ label: 'Step' })).not.toContain('action-performer')
  })
})

describe('ActionNode decision shape', () => {
  it('draws the diamond across the whole node, its tips at the middle of each side', () => {
    const html = render({ isDecision: true, label: 'Ok?' })
    // Not a rotated square: its tips would miss the node box (and so the handles).
    expect(html).not.toContain('rotate(')
    expect(html).toMatch(/<polygon[^>]*points="50,0 100,50 50,100 0,50"/)
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 100 100"[^>]*preserveAspectRatio="none"/)
  })

  it('leaves its handles where React Flow puts them: the middle of each side', () => {
    const html = render({ isDecision: true })
    const tags = [...html.matchAll(/<div[^>]*data-handleid="[^"]+"[^>]*>/g)].map((m) => m[0])
    expect(tags).toHaveLength(7)
    for (const tag of tags) expect(tag).not.toMatch(/style="[^"]*(top|left|right|bottom|transform)/)
  })
})

describe('ActionNode connection handles', () => {
  it('marks the connection handles of every shape so they can be hidden until Option', () => {
    for (const data of [{}, { isDecision: true }, { isDone: true }]) {
      const tags = [...render(data).matchAll(/<div[^>]*data-handleid="[^"]+"[^>]*>/g)]
      expect(tags.length).toBeGreaterThan(0)
      for (const m of tags) expect(m[0]).toContain('flow-handle')
    }
  })
})
