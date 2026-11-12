import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { keepFixedNodeSizes } from './layoutNodes'

const node = (id: string, type: string): Node =>
  ({ id, type, position: { x: 0, y: 0 }, data: {} }) as Node

describe('keepFixedNodeSizes', () => {
  it('keeps the position of a use case but never its layout size', () => {
    const out = keepFixedNodeSizes(
      {
        U: { artifactId: 'U', x: 10, y: 20, width: 168, height: 76 },
        P: { artifactId: 'P', x: 30, y: 40, width: 240, height: 120 },
      },
      [node('U', 'useCase'), node('P', 'part')],
    )
    expect(out.U).toEqual({ artifactId: 'U', x: 10, y: 20 })
    expect(out.P).toEqual({ artifactId: 'P', x: 30, y: 40, width: 240, height: 120 })
  })

  it('leaves patches for unknown ids alone', () => {
    const patch = { port1: { artifactId: 'port1', side: 'left' as const } }
    expect(keepFixedNodeSizes(patch, [])).toEqual(patch)
  })
})
