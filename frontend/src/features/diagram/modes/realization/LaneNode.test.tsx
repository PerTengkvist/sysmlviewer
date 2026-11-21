import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { LaneGroupNode, LaneNode, type LaneNodeData } from './LaneNode'

function render(data: Partial<LaneNodeData>): string {
  const props = {
    id: 'lane:a',
    data: { label: 'auth', laneId: 'a', kind: 'node', minWidth: 120, headerHeight: 48, ...data },
    selected: false,
  } as unknown as NodeProps
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(LaneNode, props)))
}

describe('LaneNode', () => {
  it('shows the lane name under an actor tag for an actor lane', () => {
    const html = render({ kind: 'actor', label: 'Driver' })
    expect(html).toContain('«actor»')
    expect(html).toContain('Driver')
    expect(html).toContain('data-lane-kind="actor"')
  })

  it('tells the other kinds apart', () => {
    expect(render({ kind: 'node' })).toContain('«function node»')
    expect(render({ kind: 'part' })).toContain('«logical part»')
    expect(render({ kind: 'system', label: 'System' })).toContain('«system»')
  })

  it('draws the frame of a function with its name', () => {
    const props = { id: 'g', data: { label: 'Security', groupId: 'F::Security' }, selected: false } as unknown as NodeProps
    const html = renderToStaticMarkup(createElement(LaneGroupNode, props))
    expect(html).toContain('Security')
    expect(html).toContain('data-group-id="F::Security"')
  })
})
