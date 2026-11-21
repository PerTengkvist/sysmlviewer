import type { Realization } from '../../api'

/**
 * Keeps the realization of the open project. It is derived from the model only,
 * so it is fetched again when the project or its `semantic` object changes, not
 * when only a layout was patched (new `updatedAt`, same `semantic`). Switching
 * project clears the old answer at once; an answer for a previous request is dropped.
 */
export function createRealizationLoader(
  fetchRealization: (projectId: string) => Promise<Realization>,
  onChange: (realization: Realization | null) => void,
) {
  let projectId: string | null = null
  let semantic: object | null = null
  let request = 0
  return {
    update(project: { id: string; semantic: object } | null) {
      if (!project) {
        request++
        projectId = null
        semantic = null
        onChange(null)
        return
      }
      if (project.id === projectId && project.semantic === semantic) return
      if (projectId !== null && project.id !== projectId) onChange(null)
      projectId = project.id
      semantic = project.semantic
      const mine = ++request
      fetchRealization(project.id)
        .then((res) => {
          if (mine === request) onChange(res)
        })
        .catch(() => {
          if (mine === request) onChange(null)
        })
    },
    dispose() {
      request++
    },
  }
}
