export type ArtifactKind =
  | 'package'
  | 'part'
  | 'port'
  | 'connection'
  | 'view'
  | 'attribute'
  | 'interaction'
  | 'lifeline'
  | 'message'
  | 'state'
  | 'transition'
  | 'action'
  | 'succession'
export type RoutingType = 'angular' | 'direct' | 'spline'
export type PortSide = 'left' | 'right' | 'top' | 'bottom'
export type DiagramMode =
  | 'whitebox'
  | 'structure'
  | 'sequence'
  | 'state'
  | 'actionFlow'
  | 'tree'
  | 'allocation'

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
  multiplicity?: string | null
  children: string[]
  fileId: string | null
}

export interface ElementStyleMode {
  backgroundColor?: string | null
  lineColor?: string | null
  textColor?: string | null
  lineThickness?: number | null
}

export interface ElementStyle {
  light?: ElementStyleMode | null
  dark?: ElementStyleMode | null
}

export interface Waypoint {
  x: number
  y: number
  /** When true, redraw/autoroute must keep this point. */
  locked?: boolean
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
  style?: ElementStyle | null
}

export interface VisualizationEdge {
  artifactId: string
  routing: RoutingType
  waypoints: Waypoint[]
  labelOffset?: { x: number; y: number } | null
  style?: ElementStyle | null
}

export interface SysmlFile {
  id: string
  name: string
  content: string
  warnings: string[]
  sourcePath?: string | null
  path?: string | null
}

export interface ViewDef {
  id: string
  name: string
  rootArtifactId: string
  parentViewId: string | null
  typeRef?: string | null
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
  sheet?: {
    titleBlock: {
      title: string
      createdBy: string
      editedBy: string
      version: string
      lastUpdated: string
      drawingId: string
      position: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
    } | null
    frame: {
      paper: 'A4' | 'A3'
      orientation: 'landscape' | 'portrait'
      visible: boolean
    } | null
  }
  /** Per-view geometry overlays (nodes and connection routing). */
  viewLayouts?: Record<
    string,
    {
      nodes: Record<
        string,
        Partial<Pick<VisualizationNode, 'x' | 'y' | 'width' | 'height'>>
      >
      edges?: Record<
        string,
        Partial<
          Pick<VisualizationEdge, 'routing' | 'waypoints' | 'labelOffset'>
        >
      >
    }
  >
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
}

export interface SessionPayload {
  workspaceRoot: string | null
  project: Project | null
}

export interface ViewPayload {
  view: ViewDef
  diagramMode?: DiagramMode
  hierarchicalLevels?: number
  modeError?: string | null
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
  getSession: () => request<SessionPayload>('/session'),
  createSession: (name: string, folder: string) =>
    request<SessionPayload>('/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder }),
    }),
  openSession: (body: { folder?: string; projectFile?: string }) =>
    request<SessionPayload>('/session/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  listProjects: () => request<ProjectSummary[]>('/projects'),
  createProject: (name: string, folder?: string) =>
    request<Project>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...(folder ? { folder } : {}) }),
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
  addFileByPath: (projectId: string, path: string, content?: string) =>
    request<Project>(`/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, ...(content != null ? { content } : {}) }),
    }),
  refreshFile: (projectId: string, fileId: string) =>
    request<Project>(
      `/projects/${projectId}/files/refresh/${fileId.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
      },
    ),
  putTitleBlock: (
    projectId: string,
    body: NonNullable<NonNullable<Project['sheet']>['titleBlock']>,
  ) =>
    request<Project>(`/projects/${projectId}/sheet/title-block`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteTitleBlock: (projectId: string) =>
    request<Project>(`/projects/${projectId}/sheet/title-block`, {
      method: 'DELETE',
    }),
  putFrame: (
    projectId: string,
    body: NonNullable<NonNullable<Project['sheet']>['frame']>,
  ) =>
    request<Project>(`/projects/${projectId}/sheet/frame`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteFrame: (projectId: string) =>
    request<Project>(`/projects/${projectId}/sheet/frame`, {
      method: 'DELETE',
    }),
  patchVisualization: (
    projectId: string,
    patch: {
      nodes?: Record<string, Partial<VisualizationNode>>
      edges?: Record<string, Partial<VisualizationEdge>>
      viewId?: string
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
  renameFile: (
    projectId: string,
    fileId: string,
    body: { name?: string; path?: string; sourcePath?: string | null },
  ) =>
    request<Project>(
      `/projects/${projectId}/files/item/${fileId.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  deleteFile: (projectId: string, fileId: string) =>
    request<Project>(
      `/projects/${projectId}/files/item/${fileId.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'DELETE',
      },
    ),
  listDocumentation: (projectId: string) =>
    request<{ paths: string[] }>(`/projects/${projectId}/documentation`),
  fetchDocumentation: (projectId: string, docPath: string) =>
    request<{ path: string; content: string }>(
      `/projects/${projectId}/documentation/${docPath.split('/').map(encodeURIComponent).join('/')}`,
    ),
}
