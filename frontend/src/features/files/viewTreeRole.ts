import type { Project, SemanticElement } from '../../api'

/**
 * How the model tree shows an element. In SysML v2 a `view def` defines a kind
 * of view and a `view` usage is the diagram, so only ids the backend lists as
 * diagrams open one. An old-style `view def` that no usage refers to is still
 * a diagram.
 */
export function viewTreeRole(
  el: SemanticElement,
  diagramIds: ReadonlySet<string>,
): { opensDiagram: boolean; kindLabel: string } {
  if (el.kind !== 'view') return { opensDiagram: false, kindLabel: el.kind }
  return {
    opensDiagram: diagramIds.has(el.id),
    kindLabel: el.isDefinition ? 'view def' : 'view',
  }
}

/** The general diagram a click on a package opens, or null for the package itself. */
export function packageDiagramId(project: Project, packageId: string): string | null {
  const general = project.views
    .filter(
      (view) =>
        project.semantic[view.id]?.parentId === packageId &&
        (view.typeRef === 'GeneralView' || !view.typeRef),
    )
    .map((view) => view.id)
    .sort((a, b) => a.localeCompare(b))
  return general[0] ?? null
}
