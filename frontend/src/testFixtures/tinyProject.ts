import type { Project, SemanticElement } from '../api'

function el(partial: Partial<SemanticElement> & Pick<SemanticElement, 'id' | 'kind' | 'name'>): SemanticElement {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'main.sysml',
    ...partial,
  }
}

/** One package with one part, one file. Enough for markup tests. */
export function tinyProject(): Project {
  return {
    id: 'p1',
    name: 'Tiny',
    createdAt: '',
    updatedAt: '',
    files: [
      { id: 'main.sysml', name: 'main.sysml', content: '', warnings: [], path: 'main.sysml' },
    ],
    semantic: {
      Pkg: el({ id: 'Pkg', kind: 'package', name: 'Pkg', children: ['Pkg::car'] }),
      'Pkg::car': el({
        id: 'Pkg::car',
        kind: 'part',
        name: 'Car',
        parentId: 'Pkg',
        documentation: 'A car.',
      }),
    },
    visualization: { nodes: {}, edges: {} },
    views: [],
  }
}

/**
 * `tinyProject()` plus one requirement `R-01 Safety` under `Pkg`, with a
 * `description` attribute (the Documentation-panel fallback when no .md exists).
 */
export function tinyProjectWithRequirement(): Project {
  const p = tinyProject()
  p.semantic.Pkg = { ...p.semantic.Pkg, children: ['Pkg::car', 'Pkg::R1'] }
  p.semantic['Pkg::R1'] = el({
    id: 'Pkg::R1',
    kind: 'requirement',
    name: 'Safety',
    parentId: 'Pkg',
    shortId: 'R-01',
    documentation: 'Be safe',
    children: ['Pkg::R1::description'],
  })
  p.semantic['Pkg::R1::description'] = el({
    id: 'Pkg::R1::description',
    kind: 'attribute',
    name: 'description',
    parentId: 'Pkg::R1',
    defaultValue: '"Panel text"',
  })
  return p
}
