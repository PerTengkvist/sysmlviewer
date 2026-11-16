/**
 * Sizes of the fixed shapes of an activity diagram, shared by the action flow
 * view and the use case flow dialog so both draw them alike.
 */

/** Diameter of the start and done circles. */
export const PSEUDO_NODE_SIZE = 28

/** Box of a decision diamond; its tips sit at the middle of each side. */
export const DECISION_NODE_SIZE = { width: 120, height: 80 }

export type ActionNodeShape = {
  isStart?: boolean
  isDone?: boolean
  isDecision?: boolean
}

/**
 * Size of a start, done or decision node: always this one, never a saved
 * size, so an old wide layout still draws start and done as circles. Null for
 * an action box, whose size the caller picks.
 */
export function fixedActionNodeSize(
  shape: ActionNodeShape,
): { width: number; height: number } | null {
  if (shape.isStart || shape.isDone) {
    return { width: PSEUDO_NODE_SIZE, height: PSEUDO_NODE_SIZE }
  }
  if (shape.isDecision) return { ...DECISION_NODE_SIZE }
  return null
}
