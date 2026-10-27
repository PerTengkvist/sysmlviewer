import { describe, expect, it } from 'vitest'

import { api } from './api'

describe('api surface', () => {
  it('has no relation-todo endpoints', () => {
    expect('listRelationTodos' in api).toBe(false)
    expect('deleteRelationTodo' in api).toBe(false)
  })
})
