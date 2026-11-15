import { describe, expect, it } from 'vitest'
import { buildActionFlowGraph } from './buildActionFlowGraph'
import type { SemanticElement, ViewPayload } from '../../../../api'

const root = 'F::Security::securityFlow'

function el(
  id: string,
  name: string,
  kind: SemanticElement['kind'],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind,
    name,
    parentId: root,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  }
}

function fixture(withPerformers = true): ViewPayload {
  const ids = {
    start: `${root}::start`,
    check: `${root}::checkCredential`,
    guard: `${root}::credentialValid`,
    unlock: `${root}::unlockDoors`,
    reject: `${root}::rejectKey`,
    done: `${root}::done`,
  }
  const semantic: Record<string, SemanticElement> = {
    [root]: el(root, 'securityFlow', 'action', { parentId: 'F::Security' }),
    [ids.start]: el(ids.start, 'start', 'action', { typeRef: 'start' }),
    [ids.check]: el(ids.check, 'checkCredential', 'action'),
    [ids.guard]: el(ids.guard, 'credentialValid', 'action', { typeRef: 'decide' }),
    [ids.unlock]: el(ids.unlock, 'unlockDoors', 'action'),
    [ids.reject]: el(ids.reject, 'rejectKey', 'action'),
    [ids.done]: el(ids.done, 'done', 'action', { typeRef: 'done' }),
    [`${root}::succ1`]: el(`${root}::succ1`, 'succ1', 'succession', {
      sourceId: ids.start,
      targetId: ids.check,
    }),
    [`${root}::succ2`]: el(`${root}::succ2`, 'succ2', 'succession', {
      sourceId: ids.check,
      targetId: ids.guard,
    }),
    [`${root}::if_credentialValid_yes`]: el(
      `${root}::if_credentialValid_yes`,
      'if_credentialValid_yes',
      'succession',
      { sourceId: ids.guard, targetId: ids.unlock },
    ),
    [`${root}::if_credentialValid_else`]: el(
      `${root}::if_credentialValid_else`,
      'if_credentialValid_else',
      'succession',
      { sourceId: ids.guard, targetId: ids.reject },
    ),
    [`${root}::succ3`]: el(`${root}::succ3`, 'succ3', 'succession', {
      sourceId: ids.unlock,
      targetId: ids.done,
    }),
    'F::Security::authenticate': el('F::Security::authenticate', 'authenticate', 'part', {
      parentId: 'F::Security',
    }),
    'F::Security::lockControl': el('F::Security::lockControl', 'lockControl', 'part', {
      parentId: 'F::Security',
    }),
  }
  return {
    view: {
      id: 'F::SecurityFlowView',
      name: 'SecurityFlowView',
      rootArtifactId: root,
      parentViewId: null,
      typeRef: 'ActionFlowView',
    },
    diagramMode: 'actionFlow',
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
    ...(withPerformers
      ? {
          performers: {
            [ids.check]: ['F::Security::authenticate'],
            [ids.reject]: ['F::Security::authenticate'],
            [ids.unlock]: ['F::Security::lockControl'],
          },
        }
      : {}),
  }
}

describe('buildActionFlowGraph performers', () => {
  it('puts the performer names on the action and makes room for them', () => {
    const { nodes } = buildActionFlowGraph(fixture(), 'light', 'TD')
    const check = nodes.find((n) => n.id.endsWith('::checkCredential'))
    expect(check?.data).toMatchObject({ performedBy: ['authenticate'] })

    const plain = buildActionFlowGraph(fixture(false), 'light', 'TD').nodes.find((n) =>
      n.id.endsWith('::checkCredential'),
    )
    expect(plain?.data.performedBy).toBeUndefined()
    expect(Number(check?.style?.height)).toBeGreaterThan(Number(plain?.style?.height))
  })

  it('grows a saved height that is too small for the performer row', () => {
    const view = fixture()
    view.visualization.nodes[`${root}::checkCredential`] = {
      artifactId: `${root}::checkCredential`,
      x: 10,
      y: 20,
      width: 150,
      height: 56,
      symbolRef: 'default-part',
    } as ViewPayload['visualization']['nodes'][string]
    const check = buildActionFlowGraph(view, 'light', 'TD').nodes.find((n) =>
      n.id.endsWith('::checkCredential'),
    )
    expect(Number(check?.style?.height)).toBeGreaterThan(56)
  })

  it('hides succN names and labels if/else branches YES and NO', () => {
    const { edges } = buildActionFlowGraph(fixture(), 'light', 'TD')
    const byId = (suffix: string) => edges.find((e) => e.id.endsWith(suffix))
    expect(byId('::succ1')?.label).toBeUndefined()
    expect(byId('::succ2')?.label).toBeUndefined()
    expect(byId('::succ3')?.label).toBeUndefined()
    expect(byId('::if_credentialValid_yes')?.label).toBe('YES')
    expect(byId('::if_credentialValid_else')?.label).toBe('NO')
  })

  it('places the YES branch before the NO branch', () => {
    const { nodes } = buildActionFlowGraph(fixture(), 'light')
    const y = (suffix: string) => nodes.find((n) => n.id.endsWith(suffix))!.position.y
    expect(y('::unlockDoors')).toBeLessThan(y('::rejectKey'))
  })
})
