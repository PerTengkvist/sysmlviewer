import { describe, expect, it } from 'vitest'
import { fittedPartMinimum } from './buildStructureGraph'
import { sizePartForPorts } from '../../layout/structureAutoLayout'
import type { SemanticElement, ViewPayload } from '../../../../api'

const el = (id: string, kind: string, parentId: string | null, children: string[] = []) =>
  ({
    id,
    kind,
    name: id.split('::').pop(),
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children,
    fileId: 'f',
  }) as SemanticElement

const ports = ['P::A::alpha', 'P::A::beta', 'P::A::gamma', 'P::A::delta', 'P::A::epsilon']
const semantic: Record<string, SemanticElement> = {
  'P::A': el('P::A', 'part', 'P', ports),
  'P::Plain': el('P::Plain', 'part', 'P'),
  ...Object.fromEntries(ports.map((id) => [id, el(id, 'port', 'P::A')])),
}

function viz(saved: boolean): ViewPayload['visualization'] {
  const nodes: ViewPayload['visualization']['nodes'] = {
    'P::A': { artifactId: 'P::A', x: 0, y: 0, width: 200, height: 120 } as never,
  }
  ports.forEach((id, i) => {
    nodes[id] = {
      artifactId: id,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      side: saved ? (i % 2 ? 'right' : 'left') : null,
      offset: saved ? 0.5 : null,
    } as never
  })
  return { nodes, edges: {} }
}

describe('fittedPartMinimum', () => {
  it('is the height the port labels need, and their width while ports sit by default', () => {
    const fitted = sizePartForPorts('A', ports.map((name, i) => ({
      name: name.split('::').pop()!,
      side: i % 2 ? 'right' : 'left',
    })))
    expect(fittedPartMinimum('P::A', semantic, viz(false))).toEqual({
      width: fitted.width,
      height: fitted.height,
    })
  })

  it('does not hold the width once every port has a saved place', () => {
    expect(fittedPartMinimum('P::A', semantic, viz(true)).width).toBe(0)
  })

  it('is nothing for a part without ports', () => {
    expect(fittedPartMinimum('P::Plain', semantic, viz(false))).toEqual({ width: 0, height: 0 })
  })
})
