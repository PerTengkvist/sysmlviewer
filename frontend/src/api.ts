export type ArtifactKind = 'package' | 'part' | 'port' | 'connection' | 'view' | 'attribute'
export type RoutingType = 'angular' | 'direct' | 'spline'
export type PortSide = 'left' | 'right' | 'top' | 'bottom'

export interface SemanticElement {
  id: string
  kind: ArtifactKind
  name: string
  parentId: string | null
  typeRef: string | null
  sourceId: string | null
  targetId: string | null
  exposeRef?: string | null
  defaultValue?: string | null
  children: string[]
  fileId: string | null
}

export interface VisualizationNode {
  artifactId: string
  x: number
  y: number
  width: number
  height: number
  symbolRef: string
  side: PortSide | null
  offset: number | null
}

export interface VisualizationEdge {
  artifactId: string
  routing: RoutingType
  waypoints: { x: number; y: number }[]
  labelOffset?: { x: number; y: number } | null
}

export interface SysmlFile {
  id: string
  name: string
  content: string
  warnings: string[]
  sourcePath?: string | null
}

export interface ViewDef {
  id: string
  name: string
  rootArtifactId: string
  parentViewId: string | null
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  files: SysmlFile[]
  semantic: Record<string, SemanticElement>
  visualization: {
    nodes: Record<string, VisualizationNode>
    edges: Record<string, VisualizationEdge>
  }
  views: ViewDef[]
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
}

export interface ViewPayload {
  view: ViewDef
  diagramMode?: 'whitebox' | 'structure'
  semantic: Record<string, SemanticElement>
  visualization: {
    nodes: Record<string, VisualizationNode>
    edges: Record<string, VisualizationEdge>
  }
  subdiagrams: { viewId: string; name: string }[]
  menus: Record<string, { viewId: string; name: string }[]>
}

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  listProjects: () => request<ProjectSummary[]>('/projects'),
  createProject: (name: string) =>
    request<Project>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
    }),
  saveProject: (id: string, body: { name?: string; visualization?: Project['visualization'] }) =>
    request<Project>(`/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  uploadFile: async (projectId: string, file: File, sourcePath?: string | null) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name)
    if (sourcePath) {
      form.append('sourcePath', sourcePath)
    }
    return request<Project>(`/projects/${projectId}/files`, {
      method: 'POST',
      body: form,
    })
  },
  refreshFile: async (
    projectId: string,
    fileId: string,
    file: File,
    sourcePath?: string | null,
  ) => {
    const form = new FormData()
    form.append('file', file)
    if (sourcePath) {
      form.append('sourcePath', sourcePath)
    }
    return request<Project>(`/projects/${projectId}/files/${fileId}/refresh`, {
      method: 'POST',
      body: form,
    })
  },
  patchVisualization: (
    projectId: string,
    patch: {
      nodes?: Record<string, Partial<VisualizationNode>>
      edges?: Record<string, Partial<VisualizationEdge>>
    },
  ) =>
    request<Project>(`/projects/${projectId}/visualization`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  getView: (projectId: string, viewId: string, levels = 2) =>
    request<ViewPayload>(
      `/projects/${projectId}/views/${encodeURIComponent(viewId)}?levels=${levels}`,
    ),
  addConnection: (
    projectId: string,
    body: { sourceId: string; targetId: string; name?: string },
  ) =>
    request<Project>(`/projects/${projectId}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  addPart: (projectId: string, body: { parentId: string; name?: string; typeRef?: string }) =>
    request<Project>(`/projects/${projectId}/parts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  addPort: (projectId: string, body: { parentId: string; name?: string }) =>
    request<Project>(`/projects/${projectId}/ports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  addAttribute: (projectId: string, body: { parentId: string; name?: string }) =>
    request<Project>(`/projects/${projectId}/attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  addView: (
    projectId: string,
    body: { parentId: string; name?: string; exposeRef?: string; typeRef?: string },
  ) =>
    request<Project>(`/projects/${projectId}/declared-views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  renameArtifact: (projectId: string, artifactId: string, name: string) =>
    request<Project>(`/projects/${projectId}/semantic/${encodeURIComponent(artifactId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteArtifact: (projectId: string, artifactId: string) =>
    request<Project>(`/projects/${projectId}/semantic/${encodeURIComponent(artifactId)}`, {
      method: 'DELETE',
    }),
  patchFileSourcePath: (projectId: string, fileId: string, sourcePath: string | null) =>
    request<Project>(`/projects/${projectId}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath }),
    }),
}
