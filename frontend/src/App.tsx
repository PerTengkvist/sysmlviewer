import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type PortSide,
  type Project,
  type ProjectSummary,
  type RoutingType,
  type ViewPayload,
  type VisualizationEdge,
  type VisualizationNode,
} from './api'
import { DiagramCanvas } from './features/diagram/DiagramCanvas'
import { DetailsPanel } from './features/details/DetailsPanel'
import { LeftSidebar, type LeftTab } from './features/files/LeftSidebar'
import {
  deleteFileHandlesForProject,
  exportSysmlFile,
  loadFileHandle,
  pickSysmlFile,
  pickSysmlFiles,
  saveFileHandle,
  writeFileHandle,
  type PickedSysmlFile,
} from './features/files/fileHandles'
import { SettingsDialog } from './features/settings/SettingsDialog'
import {
  applyTheme,
  loadSettings,
  saveSettings,
  type AppSettings,
} from './settings'

type CanvasMode = { type: 'diagram' } | { type: 'text'; fileId: string }

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [viewPayload, setViewPayload] = useState<ViewPayload | null>(null)
  const [diagramEpoch, setDiagramEpoch] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>({ type: 'diagram' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const refreshList = useCallback(async () => {
    const list = await api.listProjects()
    setProjects(list)
  }, [])

  useEffect(() => {
    refreshList().catch((e) => setError(String(e)))
  }, [refreshList])

  useEffect(() => {
    applyTheme(settings.viewMode)
    saveSettings(settings)
  }, [settings])

  const levels = settings.showDiagramDetails.hierarchicalLevels
  const editorMode = settings.mode === 'editor'

  const loadView = useCallback(
    async (projectId: string, viewId: string) => {
      const payload = await api.getView(projectId, viewId, levels)
      setViewPayload(payload)
      setActiveViewId(viewId)
      setDiagramEpoch((n) => n + 1)
      setCanvasMode({ type: 'diagram' })
    },
    [levels],
  )

  useEffect(() => {
    if (project && activeViewId) {
      void loadView(project.id, activeViewId)
    }
    // reload when hierarchy depth changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels])

  const loadProject = useCallback(
    async (id: string) => {
      setBusy(true)
      setError(null)
      try {
        const p = await api.getProject(id)
        setProject(p)
        setSelectedId(null)
        setLeftTab('views')
        const declared = p.views[0]
        if (declared) {
          await loadView(p.id, declared.id)
        } else {
          const pkg = Object.values(p.semantic).find((e) => e.kind === 'package')
          if (pkg) {
            await loadView(p.id, `artifact::${pkg.id}`)
          } else {
            setViewPayload(null)
            setActiveViewId(null)
          }
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [loadView],
  )

  const createProject = async () => {
    const name = window.prompt('Project name', 'New Project')
    if (!name) return
    setBusy(true)
    try {
      const p = await api.createProject(name)
      await refreshList()
      setProject(p)
      setViewPayload(null)
      setActiveViewId(null)
      setLeftTab('files')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveProject = async () => {
    if (!project) return
    setBusy(true)
    try {
      const saved = await api.saveProject(project.id, {
        name: project.name,
        visualization: project.visualization,
      })
      setProject(saved)
      await refreshList()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async () => {
    if (!project) return
    const ok = window.confirm(
      `Are you sure you want to delete project “${project.name}”? This removes all project data.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const id = project.id
      await api.deleteProject(id)
      await deleteFileHandlesForProject(id)
      setProject(null)
      setViewPayload(null)
      setActiveViewId(null)
      setSelectedId(null)
      setCanvasMode({ type: 'diagram' })
      await refreshList()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const applyProject = async (p: Project) => {
    setProject(p)
    if (activeViewId) {
      await loadView(p.id, activeViewId)
    } else if (p.views.length) {
      await loadView(p.id, p.views[0].id)
      setLeftTab('views')
    }
  }

  const syncDiskForProject = async (p: Project) => {
    if (!editorMode) return
    for (const file of p.files) {
      const handle = await loadFileHandle(p.id, file.id)
      if (handle) {
        try {
          await writeFileHandle(handle, file.content)
        } catch (e) {
          setError(`Could not write ${file.name}: ${String(e)}`)
        }
      }
    }
  }

  const ingestPickedFiles = async (picked: PickedSysmlFile[]) => {
    if (!project) {
      setError('Create or open a project first.')
      return
    }
    if (!picked.length) return
    setBusy(true)
    setError(null)
    try {
      let latest = project
      const knownIds = new Set(latest.files.map((f) => f.id))
      for (const item of picked) {
        latest = await api.uploadFile(project.id, item.file, item.sourcePath)
        const added = latest.files.find((f) => !knownIds.has(f.id))
        if (added && item.handle) {
          await saveFileHandle(project.id, added.id, item.handle)
        }
        for (const f of latest.files) knownIds.add(f.id)
      }
      await applyProject(latest)
      setLeftTab('views')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const uploadFiles = async (files: FileList) => {
    const picked: PickedSysmlFile[] = Array.from(files).map((file) => ({
      file,
      handle: null,
      sourcePath: file.webkitRelativePath || file.name,
    }))
    await ingestPickedFiles(picked)
  }

  const pickAndUploadFiles = async () => {
    try {
      const picked = await pickSysmlFiles()
      await ingestPickedFiles(picked)
    } catch (e) {
      if (String(e).includes('cancelled')) return
      setError(String(e))
    }
  }

  const refreshFile = async (fileId: string) => {
    if (!project) return
    setError(null)
    try {
      const existing = await loadFileHandle(project.id, fileId)
      const picked = await pickSysmlFile({ existingHandle: existing })
      setBusy(true)
      const p = await api.refreshFile(project.id, fileId, picked.file, picked.sourcePath)
      if (picked.handle) {
        await saveFileHandle(project.id, fileId, picked.handle)
      }
      await applyProject(p)
    } catch (e) {
      if (String(e).includes('cancelled')) return
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const exportFile = async (fileId: string) => {
    if (!project) return
    const file = project.files.find((f) => f.id === fileId)
    if (!file) return
    try {
      const existing = await loadFileHandle(project.id, fileId)
      const result = await exportSysmlFile({
        content: file.content,
        suggestedName: file.name,
        existingHandle: existing,
      })
      if (result.handle) {
        await saveFileHandle(project.id, fileId, result.handle)
      }
      const patched = await api.patchFileSourcePath(
        project.id,
        fileId,
        result.sourcePath,
      )
      setProject(patched)
    } catch (e) {
      if (String(e).includes('cancelled')) return
      setError(String(e))
    }
  }

  const onNodesMoved = useCallback(
    async (
      nodes: Record<string, Partial<VisualizationNode>>,
      edges?: Record<string, Partial<VisualizationEdge>>,
    ) => {
      if (!project) return
      try {
        const patched = await api.patchVisualization(project.id, {
          nodes,
          ...(edges && Object.keys(edges).length ? { edges } : {}),
        })
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          const nextNodes = { ...prev.visualization.nodes }
          for (const [id, patch] of Object.entries(nodes)) {
            nextNodes[id] = {
              ...(nextNodes[id] || {
                artifactId: id,
                x: 0,
                y: 0,
                width: 180,
                height: 110,
                symbolRef: 'default-part',
                side: null,
                offset: null,
              }),
              ...patch,
              artifactId: id,
            }
          }
          const nextEdges = { ...prev.visualization.edges }
          if (edges) {
            for (const [id, patch] of Object.entries(edges)) {
              const existing = nextEdges[id]
              nextEdges[id] = {
                artifactId: id,
                routing: patch.routing ?? existing?.routing ?? 'angular',
                waypoints: patch.waypoints ?? existing?.waypoints ?? [],
                labelOffset:
                  patch.labelOffset ?? existing?.labelOffset ?? { x: 0, y: 0 },
              }
            }
          }
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              nodes: nextNodes,
              edges: nextEdges,
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project],
  )

  const onPortMoved = useCallback(
    async (portId: string, side: PortSide, offset: number) => {
      if (!project) return
      try {
        const patched = await api.patchVisualization(project.id, {
          nodes: { [portId]: { artifactId: portId, side, offset } },
        })
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          const existing = prev.visualization.nodes[portId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              nodes: {
                ...prev.visualization.nodes,
                [portId]: {
                  artifactId: portId,
                  x: existing?.x ?? 0,
                  y: existing?.y ?? 0,
                  width: existing?.width ?? 12,
                  height: existing?.height ?? 12,
                  symbolRef: existing?.symbolRef ?? 'default-port',
                  side,
                  offset,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project],
  )

  const onWaypointsMoved = useCallback(
    async (connectionId: string, waypoints: { x: number; y: number }[]) => {
      if (!project) return
      try {
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, waypoints } },
        })
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          const existing = prev.visualization.edges[connectionId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              edges: {
                ...prev.visualization.edges,
                [connectionId]: {
                  artifactId: connectionId,
                  routing: existing?.routing ?? 'angular',
                  waypoints,
                  labelOffset: existing?.labelOffset ?? { x: 0, y: 0 },
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project],
  )

  const onLabelOffsetMoved = useCallback(
    async (connectionId: string, labelOffset: { x: number; y: number }) => {
      if (!project) return
      try {
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, labelOffset } },
        })
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          const existing = prev.visualization.edges[connectionId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              edges: {
                ...prev.visualization.edges,
                [connectionId]: {
                  artifactId: connectionId,
                  routing: existing?.routing ?? 'angular',
                  waypoints: existing?.waypoints ?? [],
                  labelOffset,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project],
  )

  const onRoutingChange = useCallback(
    async (connectionId: string, routing: RoutingType) => {
      if (!project) return
      try {
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, routing } },
        })
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          const existing = prev.visualization.edges[connectionId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              edges: {
                ...prev.visualization.edges,
                [connectionId]: {
                  artifactId: connectionId,
                  routing,
                  waypoints: existing?.waypoints ?? [],
                  labelOffset: existing?.labelOffset ?? { x: 0, y: 0 },
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project],
  )

  const onOpenView = useCallback(
    (viewId: string) => {
      if (!project) return
      void loadView(project.id, viewId)
    },
    [project, loadView],
  )

  const mutateAndSync = async (fn: () => Promise<Project>) => {
    if (!project) return
    setBusy(true)
    try {
      const p = await fn()
      await applyProject(p)
      await syncDiskForProject(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const onConnectPorts = useCallback(
    async (sourcePortId: string, targetPortId: string) => {
      if (!project) return
      await mutateAndSync(() =>
        api.addConnection(project.id, {
          sourceId: sourcePortId,
          targetId: targetPortId,
        }),
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, activeViewId, editorMode],
  )

  const textFile = project?.files.find(
    (f) => canvasMode.type === 'text' && f.id === canvasMode.fileId,
  )

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">SysML Viewer</div>
        <div className="header-actions">
          <select
            value={project?.id || ''}
            onChange={(e) => {
              if (e.target.value) void loadProject(e.target.value)
            }}
          >
            <option value="" disabled>
              Select project…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void createProject()}>
            New
          </button>
          <button type="button" disabled={!project || busy} onClick={() => void saveProject()}>
            Save
          </button>
          <button type="button" disabled={!project || busy} onClick={() => void deleteProject()}>
            Delete
          </button>
          <button
            type="button"
            className="settings-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          {busy && <span className="muted">Working…</span>}
          {editorMode && <span className="mode-badge">Editor</span>}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />

      <div className="workspace">
        <LeftSidebar
          project={project}
          activeTab={leftTab}
          onTabChange={setLeftTab}
          activeViewId={activeViewId}
          selectedArtifactId={selectedId}
          onSelectView={(viewId) => {
            if (!project) return
            setSelectedId(viewId)
            void loadView(project.id, viewId)
          }}
          onSelectArtifact={(artifactId) => {
            if (!project) return
            setSelectedId(artifactId)
            const el = project.semantic[artifactId]
            if (el?.kind === 'package') {
              const general = Object.values(project.semantic)
                .filter(
                  (v) =>
                    v.kind === 'view' &&
                    v.parentId === artifactId &&
                    (v.typeRef === 'GeneralView' || !v.typeRef),
                )
                .sort((a, b) => a.id.localeCompare(b.id))[0]
              if (general) {
                void loadView(project.id, general.id)
                return
              }
            }
            void loadView(project.id, `artifact::${artifactId}`)
          }}
          onUploadFiles={(files) => void uploadFiles(files)}
          onPickUpload={() => void pickAndUploadFiles()}
          onRefreshFile={(id) => void refreshFile(id)}
          onExportFile={(id) => void exportFile(id)}
          onShowText={(fileId) => setCanvasMode({ type: 'text', fileId })}
        />

        <main className="canvas-area">
          {canvasMode.type === 'text' && textFile ? (
            <div className="text-canvas">
              <div className="text-canvas-toolbar">
                <strong>{textFile.name}</strong>
                <button type="button" onClick={() => setCanvasMode({ type: 'diagram' })}>
                  Back to diagram
                </button>
              </div>
              <pre>{textFile.content}</pre>
              {textFile.warnings.length > 0 && (
                <div className="parse-warnings">
                  <h3>Parse warnings</h3>
                  <ul>
                    {textFile.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <DiagramCanvas
              view={viewPayload}
              diagramEpoch={diagramEpoch}
              showAttributes={settings.showDiagramDetails.attributes}
              onSelectArtifact={setSelectedId}
              onOpenView={onOpenView}
              onNodesMoved={(nodes) => void onNodesMoved(nodes)}
              onPortMoved={(portId, side, offset) => void onPortMoved(portId, side, offset)}
              onConnectPorts={(source, target) => void onConnectPorts(source, target)}
              onWaypointsMoved={(id, wps) => void onWaypointsMoved(id, wps)}
              onLabelOffsetMoved={(id, off) => void onLabelOffsetMoved(id, off)}
            />
          )}
        </main>

        <DetailsPanel
          project={project}
          selectedId={selectedId}
          editorMode={editorMode}
          onRoutingChange={(id, routing) => void onRoutingChange(id, routing)}
          onAutoroute={(id) => void onWaypointsMoved(id, [])}
          onRename={(id, name) =>
            void mutateAndSync(() => api.renameArtifact(project!.id, id, name))
          }
          onAddPart={(parentId) =>
            void mutateAndSync(() => api.addPart(project!.id, { parentId }))
          }
          onAddPort={(parentId) =>
            void mutateAndSync(() => api.addPort(project!.id, { parentId }))
          }
          onAddAttribute={(parentId) =>
            void mutateAndSync(() => api.addAttribute(project!.id, { parentId }))
          }
          onDelete={(id) => {
            if (!window.confirm('Delete this element?')) return
            void mutateAndSync(() => api.deleteArtifact(project!.id, id))
          }}
        />
      </div>
    </div>
  )
}
