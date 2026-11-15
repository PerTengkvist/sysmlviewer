import { describe, expect, it } from 'vitest'
import { DECISION_NODE_SIZE, PSEUDO_NODE_SIZE, fixedActionNodeSize } from './actionNodeSize'

describe('fixedActionNodeSize', () => {
  it('draws start and done as small circles', () => {
    expect(fixedActionNodeSize({ isStart: true })).toEqual({
      width: PSEUDO_NODE_SIZE,
      height: PSEUDO_NODE_SIZE,
    })
    expect(fixedActionNodeSize({ isDone: true })).toEqual({
      width: PSEUDO_NODE_SIZE,
      height: PSEUDO_NODE_SIZE,
    })
    expect(PSEUDO_NODE_SIZE).toBeLessThan(40)
  })

  it('gives a decision its diamond size', () => {
    expect(fixedActionNodeSize({ isDecision: true })).toEqual(DECISION_NODE_SIZE)
  })

  it('leaves an action box to its caller', () => {
    expect(fixedActionNodeSize({})).toBeNull()
  })
})
