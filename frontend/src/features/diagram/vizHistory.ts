/**
 * In-memory undo/redo stack for diagram visualization snapshots.
 */
import type { VisualizationEdge, VisualizationNode } from '../../api'

export type VizSnapshot = {
  nodes: Record<string, VisualizationNode>
  edges: Record<string, VisualizationEdge>
}

const DEFAULT_MAX = 50

function cloneSnapshot(snap: VizSnapshot): VizSnapshot {
  return {
    nodes: structuredClone(snap.nodes),
    edges: structuredClone(snap.edges),
  }
}

export class VizHistory {
  private past: VizSnapshot[] = []
  private future: VizSnapshot[] = []
  private readonly maxDepth: number

  constructor(maxDepth = DEFAULT_MAX) {
    this.maxDepth = Math.max(1, maxDepth)
  }

  /** Record state *before* a mutation. Clears the redo stack. */
  push(before: VizSnapshot): void {
    this.past.push(cloneSnapshot(before))
    if (this.past.length > this.maxDepth) {
      this.past.shift()
    }
    this.future = []
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * Undo: push `current` onto redo, return the previous snapshot.
   * Returns null when the undo stack is empty.
   */
  undo(current: VizSnapshot): VizSnapshot | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(cloneSnapshot(current))
    return cloneSnapshot(prev)
  }

  /**
   * Redo: push `current` onto undo, return the next snapshot.
   * Returns null when the redo stack is empty.
   */
  redo(current: VizSnapshot): VizSnapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(cloneSnapshot(current))
    return cloneSnapshot(next)
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
