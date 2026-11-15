import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { StateNode, type StateNodeData } from './StateNode'

function render(data: Partial<StateNodeData>): string {
  const props = {
    id: 's1',
    data: { label: 's1', artifactId: 's1', viewMode: 'light', ...data },
    selected: false,
  } as unknown as NodeProps
  return renderToStaticMarkup(
    createElement(ReactFlowProvider, null, createElement(StateNode, props)),
  )
}

describe('StateNode connection handles', () => {
  it('marks every handle so it hides until Option is held', () => {
    for (const data of [{}, { isInitial: true }, { isFinal: true }]) {
      const tags = [...render(data).matchAll(/<div[^>]*data-handleid="[^"]+"[^>]*>/g)]
      expect(tags).toHaveLength(4)
      for (const m of tags) expect(m[0]).toContain('flow-handle')
    }
  })
})
