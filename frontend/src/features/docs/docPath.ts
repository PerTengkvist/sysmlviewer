import type { SemanticElement } from '../../api'

const DOCUMENTED_KINDS = new Set(['package', 'part', 'view', 'port'])

/** Resolve project-relative markdown path for a semantic artifact. */
export function docPathForArtifact(el: SemanticElement | null | undefined): string | null {
  if (!el?.fileId || !DOCUMENTED_KINDS.has(el.kind)) return null
  // Port usages reference a type; document the port def only.
  if (el.kind === 'port' && el.typeRef) return null
  const slash = el.fileId.lastIndexOf('/')
  const dir = slash >= 0 ? el.fileId.slice(0, slash) : ''
  const prefix = dir ? `${dir}/docs` : 'docs'
  return `${prefix}/${el.name}.md`
}
