import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import { applyRelationTodos, type RelationTodo } from './applyRelationTodos'

const colors = { change: '#dc2626', add: '#16a34a' }

function edge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    style: { stroke: '#333', strokeWidth: 2 },
    data: {},
  }
}

describe('applyRelationTodos', () => {
  const nodes = new Set(['A', 'B', 'C'])

  it('delete removes the matching edge', () => {
    const todos: RelationTodo[] = [
      {
        id: 1,
        action: 'delete',
        original: 'dependency A to B;',
        filepath: 'f.sysml',
        rownumber: 1,
        source: 'A',
        target: 'B',
        type: 'dependency',
        new_def: '',
        relationId: 'dep1',
      },
    ]
    const { edges, pendingCount } = applyRelationTodos(
      [edge('dep1', 'A', 'B'), edge('dep2', 'A', 'C')],
      todos,
      colors,
      nodes,
    )
    expect(edges.map((e) => e.id)).toEqual(['dep2'])
    expect(pendingCount).toBe(1)
  })

  it('change rewires ends and uses change color', () => {
    const todos: RelationTodo[] = [
      {
        id: 2,
        action: 'change',
        original: 'dependency A to B;',
        filepath: 'f.sysml',
        rownumber: 1,
        source: 'A',
        target: 'C',
        type: 'dependency',
        new_def: 'dependency A to C;',
        relationId: 'dep1',
      },
    ]
    const { edges } = applyRelationTodos(
      [edge('dep1', 'A', 'B')],
      todos,
      colors,
      nodes,
    )
    expect(edges[0].source).toBe('A')
    expect(edges[0].target).toBe('C')
    expect((edges[0].style as { stroke: string }).stroke).toBe(colors.change)
  })

  it('add inserts a green visual edge not in semantic', () => {
    const todos: RelationTodo[] = [
      {
        id: 3,
        action: 'add',
        original: '',
        filepath: 'f.sysml',
        rownumber: 0,
        source: 'B',
        target: 'C',
        type: 'dependency',
        new_def: 'dependency B to C;',
      },
    ]
    const { edges } = applyRelationTodos(
      [edge('dep1', 'A', 'B')],
      todos,
      colors,
      nodes,
    )
    expect(edges).toHaveLength(2)
    const added = edges.find((e) => e.id.startsWith('todo::add::'))
    expect(added?.source).toBe('B')
    expect(added?.target).toBe('C')
    expect((added?.style as { stroke: string }).stroke).toBe(colors.add)
  })

  it('skips todos when an endpoint is outside the view', () => {
    const todos: RelationTodo[] = [
      {
        id: 4,
        action: 'add',
        original: '',
        filepath: 'f.sysml',
        rownumber: 0,
        source: 'A',
        target: 'Z',
        type: 'flow',
        new_def: 'flow A to Z;',
      },
    ]
    const { edges, pendingCount } = applyRelationTodos(
      [edge('dep1', 'A', 'B')],
      todos,
      colors,
      nodes,
    )
    expect(edges).toHaveLength(1)
    expect(pendingCount).toBe(0)
  })

  it('highest id wins for the same relation', () => {
    const todos: RelationTodo[] = [
      {
        id: 1,
        action: 'change',
        original: 'x',
        filepath: 'f',
        rownumber: 1,
        source: 'A',
        target: 'B',
        type: 'dependency',
        new_def: '',
        relationId: 'dep1',
      },
      {
        id: 5,
        action: 'delete',
        original: 'x',
        filepath: 'f',
        rownumber: 1,
        source: 'A',
        target: 'B',
        type: 'dependency',
        new_def: '',
        relationId: 'dep1',
      },
    ]
    const { edges } = applyRelationTodos(
      [edge('dep1', 'A', 'B')],
      todos,
      colors,
      nodes,
    )
    expect(edges).toHaveLength(0)
  })
})
