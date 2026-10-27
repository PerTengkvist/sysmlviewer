import type { SemanticElement } from '../../api'

const DOCUMENTED_KINDS = new Set([
  'package',
  'part',
  'view',
  'port',
  'requirement',
  'useCase',
  'actor',
  'interaction',
])

type Semantic = Record<string, SemanticElement | undefined>

/** Package ancestors of `el` (root package first). Part nesting is skipped. */
export function packagePathFor(el: SemanticElement, semantic: Semantic): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let cur = el.parentId ? semantic[el.parentId] : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (cur.kind === 'package') path.unshift(cur.name)
    cur = cur.parentId ? semantic[cur.parentId] : undefined
  }
  return path
}

function docsDir(fileId: string): string {
  const slash = fileId.lastIndexOf('/')
  const dir = slash >= 0 ? fileId.slice(0, slash) : ''
  return dir ? `${dir}/docs` : 'docs'
}

function isDocumented(el: SemanticElement | null | undefined): el is SemanticElement {
  if (!el?.fileId || !DOCUMENTED_KINDS.has(el.kind)) return false
  // Port usages reference a type; document the port def only.
  if (el.kind === 'port' && el.typeRef) return false
  return true
}

/**
 * Candidate markdown paths for an artifact, most specific first:
 * `<dir>/docs/<Package>[.<SubPackage>…].<name>.md`, then the legacy flat
 * `<dir>/docs/<name>.md` (when it differs).
 */
export function docPathCandidates(
  el: SemanticElement | null | undefined,
  semantic?: Semantic,
): string[] {
  if (!isDocumented(el)) return []
  const dir = docsDir(el.fileId as string)
  const legacy = `${dir}/${el.name}.md`
  const pkg = semantic ? packagePathFor(el, semantic) : []
  if (!pkg.length) return [legacy]
  const qualified = `${dir}/${[...pkg, el.name].join('.')}.md`
  return qualified === legacy ? [legacy] : [qualified, legacy]
}

/**
 * Resolve the markdown path for an artifact. With the project's list of
 * documentation paths the first existing candidate wins; otherwise the most
 * specific candidate is returned (legacy flat name when no model is given).
 */
export function docPathForArtifact(
  el: SemanticElement | null | undefined,
  semantic?: Semantic,
  docPaths?: readonly string[],
): string | null {
  const candidates = docPathCandidates(el, semantic)
  if (!candidates.length) return null
  if (docPaths?.length) {
    const known = new Set(docPaths)
    const hit = candidates.find((c) => known.has(c))
    if (hit) return hit
  }
  return candidates[0]
}
