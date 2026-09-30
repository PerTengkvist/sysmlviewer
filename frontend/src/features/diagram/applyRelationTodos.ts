import type { Edge } from '@xyflow/react'

export type RelationTodoAction = 'add' | 'change' | 'delete'

export type RelationTodoType =
  | 'connection'
  | 'dependency'
  | 'use'
  | 'extend'
  | 'include'
  | 'flow'
  | 'satisfy'
  | 'derive'
  | 'refine'
  | 'allocation'

export type RelationTodo = {
  id: number
  action: RelationTodoAction
  original: string
  filepath: string
  rownumber: number
  source: string
  target: string
  type: RelationTodoType
  new_def: string
  /** Semantic relation id when known (for delete/change of existing). */
  relationId?: string
}

export type PendingColors = {
  change: string
  add: string
}

export type ApplyRelationTodosResult = {
  edges: Edge[]
  /** Number of todos that affected this view. */
  pendingCount: number
}

function edgeEndpoints(e: Edge): { source: string; target: string } {
  return { source: e.source, target: e.target }
}

function matchExisting(
  edges: Edge[],
  todo: RelationTodo,
): Edge | undefined {
  if (todo.relationId) {
    const byId = edges.find((e) => e.id === todo.relationId)
    if (byId) return byId
  }
  return edges.find(
    (e) => e.source === todo.source && e.target === todo.target,
  )
}

/**
 * Apply relation todos in id order (highest id wins for same relation).
 * Does not mutate semantic/visualization — only the edge list for rendering.
 */
export function applyRelationTodos(
  edges: Edge[],
  todos: RelationTodo[],
  colors: PendingColors,
  visibleNodeIds: Set<string>,
): ApplyRelationTodosResult {
  const ordered = [...todos].sort((a, b) => a.id - b.id)
  let next = edges.map((e) => ({ ...e, data: { ...(e.data as object) } }))
  let pendingCount = 0

  // Collapse: last todo per relation key wins
  const lastByKey = new Map<string, RelationTodo>()
  for (const t of ordered) {
    const key = t.relationId || `${t.source}->${t.target}:${t.type}`
    lastByKey.set(key, t)
  }

  for (const todo of lastByKey.values()) {
    if (todo.action === 'delete') {
      const before = next.length
      next = next.filter((e) => {
        if (todo.relationId && e.id === todo.relationId) return false
        const ep = edgeEndpoints(e)
        return !(ep.source === todo.source && ep.target === todo.target)
      })
      if (next.length !== before) pendingCount += 1
      continue
    }

    if (todo.action === 'change') {
      if (!visibleNodeIds.has(todo.source) || !visibleNodeIds.has(todo.target)) {
        continue
      }
      const existing = matchExisting(next, todo)
      if (!existing) continue
      pendingCount += 1
      next = next.map((e) => {
        if (e.id !== existing.id) return e
        return {
          ...e,
          source: todo.source,
          target: todo.target,
          style: {
            ...(e.style as object),
            stroke: colors.change,
          },
          data: {
            ...(e.data as object),
            pendingAction: 'change',
            selectedColor: colors.change,
          },
        }
      })
      continue
    }

    if (todo.action === 'add') {
      if (!visibleNodeIds.has(todo.source) || !visibleNodeIds.has(todo.target)) {
        continue
      }
      pendingCount += 1
      const id = `todo::add::${todo.id}`
      next = [
        ...next.filter((e) => e.id !== id),
        {
          id,
          source: todo.source,
          target: todo.target,
          type: 'sysml',
          style: { stroke: colors.add, strokeWidth: 2 },
          data: {
            routing: 'direct',
            artifactId: id,
            pendingAction: 'add',
            selectedColor: colors.add,
          },
        },
      ]
    }
  }

  return { edges: next, pendingCount }
}
