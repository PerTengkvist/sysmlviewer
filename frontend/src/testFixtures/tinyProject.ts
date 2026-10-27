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
