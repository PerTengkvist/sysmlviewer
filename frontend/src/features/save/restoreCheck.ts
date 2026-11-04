/**
 * Decides when to compare a freshly opened diagram with its saved layout.
 * A diagram routed automatically on open is rewriting that layout, so
 * comparing it would only report the routing.
 */
export function createRestoreCheck() {
  let lastEpoch: number | null = null
  return {
    claim: (diagramEpoch: number, autoRoutePending: boolean): boolean => {
      if (diagramEpoch === lastEpoch) return false
      lastEpoch = diagramEpoch
      return !autoRoutePending
    },
  }
}
