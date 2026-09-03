import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type ElementStyle,
  type ExampleProject,
  type PortSide,
  type Project,
  type RoutingType,
  type ViewPayload,
  type VisualizationEdge,
  type VisualizationNode,
} from './api'
import { DiagramCanvas } from './features/diagram/DiagramCanvas'
import { RightSidebar } from './features/details/RightSidebar'
import { LeftSidebar, type LeftTab } from './features/files/LeftSidebar'
import { MarkdownCanvas } from './features/docs/MarkdownCanvas'
import { WorkspaceLayout } from './features/layout/WorkspaceLayout'
import { WorkspaceDialog } from './features/files/WorkspaceDialog'
import { normalizeRelSysmlPath } from './features/files/workspacePaths'
import { PrintDialog } from './features/print/PrintDialog'
import { PrintSheet } from './features/print/PrintSheet'
import { buildPrintPages, type PrintPage } from './features/print/printLayout'
import { docPathForArtifact } from './features/docs/docPath'
import { SheetDialog } from './features/sheet/SheetDialog'
import { normalizeSheet, type ProjectSheet } from './features/sheet/sheet'
import { SettingsDialog } from './features/settings/SettingsDialog'
import {
  applyTheme,
  loadSettings,
  saveSettings,
  type AppSettings,
} from './settings'

type CanvasMode =
  | { type: 'diagram' }
  | { type: 'text'; fileId: string }
  | { type: 'markdown'; docPath: string }

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [exampleProjects, setExampleProjects] = useState<ExampleProject[]>([])
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
  const [workspaceDialog, setWorkspaceDialog] = useState<'new' | 'open' | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printPages, setPrintPages] = useState<PrintPage[] | null>(null)
  const [printReadyIds, setPrintReadyIds] = useState<Set<string>>(() => new Set())
  const [printPreparing, setPrintPreparing] = useState(false)
  const [autorouteRequest, setAutorouteRequest] = useState<{
    connectionId: string
    seq: number
  } | null>(null)
  const [docPaths, setDocPaths] = useState<string[]>([])

  const structureNotation =
    settings.showDiagramDetails.structureNotation ?? 'sysmlv2'

  const applySession = useCallback(
    async (session: { workspaceRoot: string | null; project: Project | null }) => {
      setWorkspaceRoot(session.workspaceRoot)
      if (session.project) {
        setProject(session.project)
        setSelectedId(null)
        setLeftTab('views')
        const declared = session.project.views[0]
        if (declared) {
          const payload = await api.getView(
            session.project.id,
            declared.id,
            settings.showDiagramDetails.hierarchicalLevels,
            structureNotation,
          )
          setViewPayload(payload)
          setActiveViewId(declared.id)
          setDiagramEpoch((n) => n + 1)
          setCanvasMode({ type: 'diagram' })
        } else {
          const pkg = Object.values(session.project.semantic).find(
            (e) => e.kind === 'package',
          )
          if (pkg) {
            const payload = await api.getView(
              session.project.id,
              `artifact::${pkg.id}`,
              settings.showDiagramDetails.hierarchicalLevels,
              structureNotation,
            )
            setViewPayload(payload)
            setActiveViewId(`artifact::${pkg.id}`)
            setDiagramEpoch((n) => n + 1)
          } else {
            setViewPayload(null)
            setActiveViewId(null)
          }
        }
      } else {
        setProject(null)
        setViewPayload(null)
        setActiveViewId(null)
      }
    },
    [settings.showDiagramDetails.hierarchicalLevels, structureNotation],
  )

  useEffect(() => {
    api
      .getSession()
      .then((s) => applySession(s))
      .catch((e) => setError(String(e)))
  }, [applySession])

  useEffect(() => {
    api
      .listExampleProjects()
      .then(setExampleProjects)
      .catch(() => setExampleProjects([]))
  }, [])

  useEffect(() => {
    applyTheme(settings.viewMode)
    saveSettings(settings)
  }, [settings])

  const levels = settings.showDiagramDetails.hierarchicalLevels
  const editorMode = settings.mode === 'editor'
  const sheet: ProjectSheet = normalizeSheet(project?.sheet)

  const loadView = useCallback(
    async (projectId: string, viewId: string) => {
      const payload = await api.getView(
        projectId,
        viewId,
        levels,
        structureNotation,
      )
      setViewPayload(payload)
      setActiveViewId(viewId)
      setDiagramEpoch((n) => n + 1)
      setCanvasMode({ type: 'diagram' })
    },
    [levels, structureNotation],
  )

  useEffect(() => {
    if (project && activeViewId) {
      void loadView(project.id, activeViewId)
    }
    // Reload when hierarchy depth or structure notation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, structureNotation])

  useEffect(() => {
    if (!project) {
      setDocPaths([])
      return
    }
    let cancelled = false
    void api.listDocumentation(project.id).then((res) => {
      if (!cancelled) setDocPaths(res.paths)
    }).catch(() => {
      if (!cancelled) setDocPaths([])
    })
    return () => {
      cancelled = true
    }
  }, [project?.id, project?.updatedAt])

  const updateHorizontalLayout = useCallback((sizes: [number, number, number]) => {
    setSettings((prev) => {
      const next = { ...prev, horizontalPanelSizes: sizes }
      saveSettings(next)
      return next
    })
  }, [])

  const updateRightLayout = useCallback((sizes: [number, number]) => {
    setSettings((prev) => {
      const next = { ...prev, rightPanelSizes: sizes }
      saveSettings(next)
      return next
    })
  }, [])

  const createProject = async (name: string, folder: string) => {
    setBusy(true)
    setError(null)
    try {
      const session = await api.createSession(name, folder)
      setWorkspaceDialog(null)
      await applySession(session)
      setLeftTab('files')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const openFolder = async (folder: string) => {
    setBusy(true)
    setError(null)
    try {
      const session = await api.openSession({ folder })
      setWorkspaceDialog(null)
      await applySession(session)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const openProjectFile = async (projectFile: string) => {
    setBusy(true)
    setError(null)
    try {
      const session = await api.openSession({ projectFile })
      setWorkspaceDialog(null)
      await applySession(session)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const onProjectsMenuChange = (value: string) => {
    if (!value) return
    if (value === '__open__') {
      setWorkspaceDialog('open')
      return
    }
    void openFolder(value)
  }

  const projectsMenuValue =
    workspaceRoot && exampleProjects.some((p) => p.folder === workspaceRoot)
      ? workspaceRoot
      : ''

  const saveProject = async () => {
    if (!project) return
    setBusy(true)
    try {
      const saved = await api.saveProject(project.id, {
        name: project.name,
        visualization: project.visualization,
      })
      setProject(saved)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async () => {
    if (!project) return
    const ok = window.confirm(
      `Delete project metadata for “${project.name}”? SysML source files on disk are kept.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteProject(project.id)
      setProject(null)
      setWorkspaceRoot(null)
      setViewPayload(null)
      setActiveViewId(null)
      setSelectedId(null)
      setCanvasMode({ type: 'diagram' })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const exportViewJson = async () => {
    if (!project || !activeViewId) return
    setBusy(true)
    setError(null)
    try {
      const { path } = await api.exportView(project.id, activeViewId)
      if (path == null) return
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

  const addFileByPath = async () => {
    if (!project) {
      setError('Create or open a project first.')
      return
    }
    const raw = window.prompt('Relative path to .sysml under the project folder', 'model.sysml')
    if (!raw) return
    const path = normalizeRelSysmlPath(raw)
    if (!path) {
      setError('Invalid relative path')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const latest = await api.addFileByPath(project.id, path)
      await applyProject(latest)
      setLeftTab('views')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const refreshFile = async (fileId: string) => {
    if (!project) return
    setBusy(true)
    setError(null)
    try {
      const p = await api.refreshFile(project.id, fileId)
      await applyProject(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const mutateAndSync = async (fn: () => Promise<Project>) => {
    if (!project) return
    setBusy(true)
    setError(null)
    try {
      const p = await fn()
      await applyProject(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const printDiagrams = useMemo(() => {
    if (!project) return []
    return project.views.map((v) => ({
      id: v.id,
      name: v.name,
      widthPx: 640,
      heightPx: 480,
    }))
  }, [project])

  const onNodesMoved = useCallback(
    async (
      nodes: Record<string, Partial<VisualizationNode>>,
      edges?: Record<string, Partial<VisualizationEdge>>,
    ) => {
      if (!project) return
      try {
        const viewId = viewPayload?.view.id
        const patched = await api.patchVisualization(project.id, {
          nodes,
          ...(edges && Object.keys(edges).length ? { edges } : {}),
          ...(viewId ? { viewId } : {}),
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
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
                style: patch.style ?? existing?.style,
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
    [project, viewPayload?.view.id],
  )

  const onHierarchyOverrideChange = useCallback(
    async (override: number | null) => {
      if (!project || !activeViewId) return
      try {
        await api.patchVisualization(project.id, {
          viewId: activeViewId,
          hierarchicalLevelsOverride: override,
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
        })
        await loadView(project.id, activeViewId)
      } catch (e) {
        setError(String(e))
      }
    },
    [
      project,
      activeViewId,
      loadView,
      settings.showDiagramDetails.structureNotation,
    ],
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
                  style: existing?.style,
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

  const onRelationEndMoved = useCallback(
    async (
      artifactId: string,
      end: 'source' | 'target',
      side: PortSide,
      offset: number,
      companion?: { side: PortSide; offset: number },
    ) => {
      if (!project) return
      // Persist synthetic Arcadia composition/aggregation under the view layout too.
      const patch =
        end === 'source'
          ? {
              sourceSide: side,
              sourceOffset: offset,
              ...(companion
                ? {
                    targetSide: companion.side,
                    targetOffset: companion.offset,
                  }
                : {}),
            }
          : {
              targetSide: side,
              targetOffset: offset,
              ...(companion
                ? {
                    sourceSide: companion.side,
                    sourceOffset: companion.offset,
                  }
                : {}),
            }
      try {
        const viewId = viewPayload?.view.id
        const patched = await api.patchVisualization(project.id, {
          viewId: viewId || undefined,
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
          edges: { [artifactId]: { artifactId, ...patch } },
        })
        // Keep identity stable — only merge visualization/viewLayouts from response
        setProject((prev) =>
          prev
            ? {
                ...prev,
                visualization: patched.visualization,
                viewLayouts: patched.viewLayouts,
                updatedAt: patched.updatedAt,
              }
            : patched,
        )
        setViewPayload((prev) => {
          if (!prev) return prev
          const existing = prev.visualization.edges[artifactId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              edges: {
                ...prev.visualization.edges,
                [artifactId]: {
                  artifactId,
                  routing: existing?.routing ?? 'direct',
                  waypoints: existing?.waypoints ?? [],
                  labelOffset: existing?.labelOffset,
                  style: existing?.style,
                  sourceSide: existing?.sourceSide,
                  sourceOffset: existing?.sourceOffset,
                  targetSide: existing?.targetSide,
                  targetOffset: existing?.targetOffset,
                  ...patch,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project, viewPayload?.view.id],
  )

  const onAutorouteConnection = useCallback((connectionId: string) => {
    setAutorouteRequest((prev) => ({
      connectionId,
      seq: (prev?.seq ?? 0) + 1,
    }))
  }, [])

  const onWaypointsMoved = useCallback(
    async (
      connectionId: string,
      waypoints: { x: number; y: number; locked?: boolean }[],
    ) => {
      if (!project) return
      try {
        const viewId = viewPayload?.view.id
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, waypoints } },
          ...(viewId ? { viewId } : {}),
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
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
                  routing: existing?.routing ?? 'direct',
                  waypoints,
                  labelOffset: existing?.labelOffset ?? { x: 0, y: 0 },
                  style: existing?.style,
                  sourceSide: existing?.sourceSide,
                  sourceOffset: existing?.sourceOffset,
                  targetSide: existing?.targetSide,
                  targetOffset: existing?.targetOffset,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project, viewPayload?.view.id],
  )

  const onLabelOffsetMoved = useCallback(
    async (connectionId: string, labelOffset: { x: number; y: number }) => {
      if (!project) return
      try {
        const viewId = viewPayload?.view.id
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, labelOffset } },
          ...(viewId ? { viewId } : {}),
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
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
                  routing: existing?.routing ?? 'direct',
                  waypoints: existing?.waypoints ?? [],
                  labelOffset,
                  style: existing?.style,
                  sourceSide: existing?.sourceSide,
                  sourceOffset: existing?.sourceOffset,
                  targetSide: existing?.targetSide,
                  targetOffset: existing?.targetOffset,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project, viewPayload?.view.id],
  )

  const onRoutingChange = useCallback(
    async (connectionId: string, routing: RoutingType) => {
      if (!project) return
      try {
        const viewId = viewPayload?.view.id
        const patched = await api.patchVisualization(project.id, {
          edges: { [connectionId]: { artifactId: connectionId, routing } },
          ...(viewId ? { viewId } : {}),
          structureNotation:
            settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
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
                  style: existing?.style,
                  sourceSide: existing?.sourceSide,
                  sourceOffset: existing?.sourceOffset,
                  targetSide: existing?.targetSide,
                  targetOffset: existing?.targetOffset,
                },
              },
            },
          }
        })
      } catch (e) {
        setError(String(e))
      }
    },
    [project, viewPayload?.view.id],
  )

  const onStyleChange = useCallback(
    async (artifactId: string, style: ElementStyle, kind: 'node' | 'edge') => {
      if (!project) return
      try {
        const patch =
          kind === 'edge'
            ? { edges: { [artifactId]: { artifactId, style } } }
            : { nodes: { [artifactId]: { artifactId, style } } }
        const patched = await api.patchVisualization(project.id, patch)
        setProject(patched)
        setViewPayload((prev) => {
          if (!prev) return prev
          if (kind === 'edge') {
            const existing = prev.visualization.edges[artifactId]
            return {
              ...prev,
              visualization: {
                ...prev.visualization,
                edges: {
                  ...prev.visualization.edges,
                [artifactId]: {
                  artifactId,
                  routing: existing?.routing ?? 'direct',
                  waypoints: existing?.waypoints ?? [],
                  labelOffset: existing?.labelOffset ?? { x: 0, y: 0 },
                  style,
                  sourceSide: existing?.sourceSide,
                  sourceOffset: existing?.sourceOffset,
                  targetSide: existing?.targetSide,
                  targetOffset: existing?.targetOffset,
                },
                },
              },
            }
          }
          const existing = prev.visualization.nodes[artifactId]
          return {
            ...prev,
            visualization: {
              ...prev.visualization,
              nodes: {
                ...prev.visualization.nodes,
                [artifactId]: {
                  artifactId,
                  x: existing?.x ?? 0,
                  y: existing?.y ?? 0,
                  width: existing?.width ?? 180,
                  height: existing?.height ?? 100,
                  symbolRef: existing?.symbolRef ?? 'default-part',
                  side: existing?.side ?? null,
                  offset: existing?.offset ?? null,
                  style,
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

  const onConnectPorts = useCallback(
    async (_sourcePortId: string, _targetPortId: string) => {
      // SysML sources are read-only; do not create connections via the viewer.
    },
    [],
  )

  const textFile = project?.files.find(
    (f) => canvasMode.type === 'text' && f.id === canvasMode.fileId,
  )

  const runPrint = useCallback(
    async (options: {
      selected: Record<string, boolean>
      mode: import('./features/print/printLayout').PrintMode
      includeDescriptions: boolean
    }) => {
      if (!project) return
      setPrintOpen(false)
      const pages = buildPrintPages({
        diagrams: printDiagrams,
        selected: options.selected,
        mode: options.mode,
        sheet,
      })
      if (!pages.length) return

      setPrintPreparing(true)
      setError(null)
      try {
        const enriched = await Promise.all(
          pages.map(async (page) => ({
            ...page,
            diagrams: await Promise.all(
              page.diagrams.map(async (d) => {
                // Prefer the live canvas payload for the open view so print
                // matches hierarchy depth / notation currently on screen.
                const live =
                  viewPayload && viewPayload.view.id === d.id ? viewPayload : null
                const payload =
                  live ??
                  (await api.getView(
                    project.id,
                    d.id,
                    settings.showDiagramDetails.hierarchicalLevels,
                    settings.showDiagramDetails.structureNotation ?? 'sysmlv2',
                  ))
                let documentation: string | null = null
                if (options.includeDescriptions) {
                  const el = project.semantic[d.id]
                  const path = docPathForArtifact(el)
                  if (path) {
                    try {
                      const doc = await api.fetchDocumentation(project.id, path)
                      documentation = doc.content
                    } catch {
                      documentation = null
                    }
                  }
                }
                return { ...d, viewPayload: payload, documentation }
              }),
            ),
          })),
        )
        setPrintReadyIds(new Set())
        setPrintPages(enriched)
      } catch (e) {
        setError(String(e))
        setPrintPages(null)
      } finally {
        setPrintPreparing(false)
      }
    },
    [
      project,
      printDiagrams,
      sheet,
      viewPayload,
      settings.showDiagramDetails.hierarchicalLevels,
      settings.showDiagramDetails.structureNotation,
    ],
  )

  const printDiagramCount = useMemo(
    () => printPages?.reduce((n, p) => n + p.diagrams.length, 0) ?? 0,
    [printPages],
  )

  useEffect(() => {
    if (!printPages || printDiagramCount === 0) return
    if (printReadyIds.size < printDiagramCount) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [printPages, printDiagramCount, printReadyIds])

  useEffect(() => {
    const clearPrint = () => {
      setPrintPages(null)
      setPrintReadyIds(new Set())
    }
    window.addEventListener('afterprint', clearPrint)
    return () => window.removeEventListener('afterprint', clearPrint)
  }, [])

  const onPrintDiagramReady = useCallback((diagramId: string) => {
    setPrintReadyIds((prev) => {
      if (prev.has(diagramId)) return prev
      const next = new Set(prev)
      next.add(diagramId)
      return next
    })
  }, [])

  return (
    <div className={`app-shell${printPages ? ' printing' : ''}`}>
      <header className="app-header no-print">
        <div className="brand">SysML Viewer</div>
        <div className="header-actions">
          <span className="workspace-label muted" title={workspaceRoot || undefined}>
            {project ? project.name : 'No project'}
            {workspaceRoot ? ` — ${workspaceRoot}` : ''}
          </span>
          {exampleProjects.length > 0 && (
            <select
              className="projects-menu"
              aria-label="Example projects"
              value={projectsMenuValue}
              disabled={busy}
              onChange={(e) => onProjectsMenuChange(e.target.value)}
            >
              <option value="">Examples…</option>
              {exampleProjects.map((p) => (
                <option key={p.id} value={p.folder}>
                  {p.name}
                </option>
              ))}
              <option value="__open__">Open other…</option>
            </select>
          )}
          <button type="button" onClick={() => setWorkspaceDialog('new')}>
            New
          </button>
          <button type="button" onClick={() => setWorkspaceDialog('open')}>
            Open
          </button>
          <button type="button" disabled={!project || busy} onClick={() => void saveProject()}>
            Save
          </button>
          <button
            type="button"
            disabled={!project || !activeViewId || busy}
            onClick={() => void exportViewJson()}
            title="Export the open view layout as JSON"
          >
            Export JSON
          </button>
          <button type="button" disabled={!project || busy} onClick={() => void deleteProject()}>
            Delete
          </button>
          <button
            type="button"
            disabled={!project}
            onClick={() => setSheetOpen(true)}
            title="Drawing sheet"
          >
            Sheet
          </button>
          <button
            type="button"
            disabled={!project || !project.views.length}
            onClick={() => setPrintOpen(true)}
          >
            Print
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
          {printPreparing && <span className="muted">Preparing print…</span>}
          {editorMode && <span className="mode-badge">Editor</span>}
        </div>
      </header>

      {error && (
        <div className="error-banner no-print" role="alert">
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
      <WorkspaceDialog
        open={workspaceDialog != null}
        mode={workspaceDialog || 'new'}
        initialFolder={workspaceRoot || ''}
        exampleProjects={exampleProjects}
        onClose={() => setWorkspaceDialog(null)}
        onCreate={(name, folder) => void createProject(name, folder)}
        onOpenFolder={(folder) => void openFolder(folder)}
        onOpenProjectFile={(pf) => void openProjectFile(pf)}
      />
      {project && (
        <SheetDialog
          open={sheetOpen}
          sheet={sheet}
          onClose={() => setSheetOpen(false)}
          onSaveTitleBlock={(block) =>
            void mutateAndSync(() => api.putTitleBlock(project.id, block))
          }
          onClearTitleBlock={() =>
            void mutateAndSync(() => api.deleteTitleBlock(project.id))
          }
          onSaveFrame={(frame) =>
            void mutateAndSync(() => api.putFrame(project.id, frame))
          }
          onClearFrame={() => void mutateAndSync(() => api.deleteFrame(project.id))}
        />
      )}
      {project && (
        <PrintDialog
          open={printOpen}
          diagrams={printDiagrams}
          activeViewId={activeViewId}
          sheet={sheet}
          onClose={() => setPrintOpen(false)}
          onPrint={runPrint}
        />
      )}

      <WorkspaceLayout
        layout={settings}
        onLayoutChange={updateHorizontalLayout}
        left={
          <LeftSidebar
            project={project}
            docPaths={docPaths}
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
            onAddFilePath={() => void addFileByPath()}
            onRefreshFile={(id) => void refreshFile(id)}
            onDeleteFile={(id) =>
              void mutateAndSync(async () => {
                const p = await api.deleteFile(project!.id, id)
                return p
              })
            }
            onShowText={(fileId) => setCanvasMode({ type: 'text', fileId })}
            onShowMarkdown={(path) => setCanvasMode({ type: 'markdown', docPath: path })}
          />
        }
        center={
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
            ) : canvasMode.type === 'markdown' ? (
              <MarkdownCanvas
                projectId={project?.id}
                docPath={canvasMode.docPath}
                onBack={() => setCanvasMode({ type: 'diagram' })}
              />
            ) : (
              <DiagramCanvas
                view={viewPayload}
                diagramEpoch={diagramEpoch}
                viewMode={settings.viewMode}
                showAttributes={settings.showDiagramDetails.attributes}
                structureNotation={settings.showDiagramDetails.structureNotation}
                selectedConnectionColor={settings.selectedConnectionColor}
                selectedConnectionLinewidth={settings.selectedConnectionLinewidth}
                connectionSeparation={settings.connectionSeparation}
                sheet={sheet}
                onSelectArtifact={setSelectedId}
                onOpenView={onOpenView}
                onNodesMoved={(nodes, edges) => void onNodesMoved(nodes, edges)}
                onPortMoved={(portId, side, offset) => void onPortMoved(portId, side, offset)}
                onRelationEndMoved={(id, end, side, offset, companion) =>
                  void onRelationEndMoved(id, end, side, offset, companion)
                }
                onConnectPorts={(source, target) => void onConnectPorts(source, target)}
                onWaypointsMoved={(id, wps) => void onWaypointsMoved(id, wps)}
                onLabelOffsetMoved={(id, off) => void onLabelOffsetMoved(id, off)}
                autorouteRequest={autorouteRequest}
              />
            )}
          </main>
        }
        right={
          <RightSidebar
            layout={settings}
            onLayoutChange={updateRightLayout}
            project={project}
            viewVisualization={viewPayload?.visualization}
            viewPayload={viewPayload}
            globalHierarchicalLevels={
              settings.showDiagramDetails.hierarchicalLevels
            }
            selectedId={selectedId}
            editorMode={editorMode}
            viewMode={settings.viewMode}
            onHierarchyOverrideChange={(override) =>
              void onHierarchyOverrideChange(override)
            }
            onRoutingChange={(id, routing) => void onRoutingChange(id, routing)}
            onAutoroute={(id) => void onAutorouteConnection(id)}
            onWaypointsChange={(id, wps) => void onWaypointsMoved(id, wps)}
            onStyleChange={(id, style, kind) => void onStyleChange(id, style, kind)}
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
        }
      />

      {printPages && (
        <PrintSheet
          pages={printPages}
          sheet={sheet}
          viewMode={settings.viewMode}
          showAttributes={settings.showDiagramDetails.attributes}
          selectedConnectionColor={settings.selectedConnectionColor}
          selectedConnectionLinewidth={settings.selectedConnectionLinewidth}
          connectionSeparation={settings.connectionSeparation}
          onDiagramReady={onPrintDiagramReady}
        />
      )}
    </div>
  )
}
