import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Project, SemanticElement, SysmlFile } from '../../api'
import { buildFileTree, type FileTreeNode } from './buildFileTree'

export type LeftTab = 'views' | 'files'

type Props = {
  project: Project | null
  docPaths: string[]
  activeTab: LeftTab
  onTabChange: (tab: LeftTab) => void
  activeViewId: string | null
  selectedArtifactId: string | null
  onSelectView: (viewId: string) => void
  onSelectArtifact: (artifactId: string) => void
  onAddFilePath: () => void
  onRefreshFile: (fileId: string) => void
  onDeleteFile?: (fileId: string) => void
  onShowText: (fileId: string) => void
  onShowMarkdown: (docPath: string) => void
}

function sortChildIds(
  childIds: string[],
  byId: Record<string, SemanticElement>,
): string[] {
  return [...childIds]
    .filter((cid) => byId[cid])
    .sort((a, b) => {
      const ka = byId[a].kind === 'view' ? 0 : 1
      const kb = byId[b].kind === 'view' ? 0 : 1
      if (ka !== kb) return ka - kb
      return a.localeCompare(b)
    })
}

function folderFromFileId(fileId: string | null | undefined): string | null {
  if (!fileId?.includes('/')) return null
  return fileId.split('/')[0] || null
}

function groupRootsByFolder(roots: SemanticElement[]): {
  folders: { name: string; roots: SemanticElement[] }[]
  ungrouped: SemanticElement[]
} {
  const byFolder = new Map<string, SemanticElement[]>()
  const ungrouped: SemanticElement[] = []
  for (const el of roots) {
    const folder = folderFromFileId(el.fileId)
    if (folder) {
      const list = byFolder.get(folder) || []
      list.push(el)
      byFolder.set(folder, list)
    } else {
      ungrouped.push(el)
    }
  }
  const folders = [...byFolder.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, roots: byFolder.get(name) || [] }))
  return { folders, ungrouped }
}

function ViewTree({
  semantic,
  selectedId,
  activeViewId,
  onSelectArtifact,
  onSelectView,
}: {
  semantic: Record<string, SemanticElement>
  selectedId: string | null
  activeViewId: string | null
  onSelectArtifact: (artifactId: string) => void
  onSelectView: (viewId: string) => void
}) {
  const semanticKey = Object.keys(semantic).sort().join('|')

  const { byId, roots, folderGroups } = useMemo(() => {
    const elements = Object.values(semantic)
    const map = Object.fromEntries(elements.map((e) => [e.id, e]))
    const rootList = elements
      .filter((e) => !e.parentId || !map[e.parentId])
      .sort((a, b) => a.id.localeCompare(b.id))
    const grouped = groupRootsByFolder(rootList)
    return { byId: map, roots: rootList, folderGroups: grouped }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticKey])

  const defaultFolderCollapsed = useMemo(() => new Set<string>(), [])

  const [folderCollapsed, setFolderCollapsed] = useState<Set<string>>(defaultFolderCollapsed)

  useEffect(() => {
    setFolderCollapsed(new Set(defaultFolderCollapsed))
  }, [defaultFolderCollapsed])

  const defaultCollapsed = useMemo(() => {
    const collapsed = new Set<string>()
    const walk = (id: string, depth: number) => {
      const el = byId[id]
      if (!el) return
      const kids = sortChildIds(el.children || [], byId)
      if (depth >= 1 && kids.length) collapsed.add(id)
      for (const cid of kids) walk(cid, depth + 1)
    }
    for (const r of roots) walk(r.id, 0)
    return collapsed
  }, [byId, roots])

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(defaultCollapsed)

  useEffect(() => {
    setCollapsedIds(new Set(defaultCollapsed))
  }, [defaultCollapsed])

  const toggleFolder = (folderKey: string) => {
    setFolderCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      return next
    })
  }

  const toggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const render = (el: SemanticElement, depth: number): ReactNode => {
    const childIds = sortChildIds(el.children || [], byId)
    const hasChildren = childIds.length > 0
    const collapsed = collapsedIds.has(el.id)
    const active =
      selectedId === el.id ||
      activeViewId === el.id ||
      activeViewId === `artifact::${el.id}`
    const isView = el.kind === 'view'
    return (
      <div key={el.id} className="tree-item" style={{ paddingLeft: depth * 12 }}>
        <div
          className={`tree-row${isView ? ' is-view' : ' is-other'}${active ? ' active' : ''}`}
        >
          {hasChildren ? (
            <button
              type="button"
              className="tree-expand-btn"
              aria-label={collapsed ? 'Expand' : 'Collapse'}
              aria-expanded={!collapsed}
              onClick={(e) => {
                e.stopPropagation()
                toggle(el.id)
              }}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="tree-expand-btn spacer" aria-hidden />
          )}
          <button
            type="button"
            className="tree-label"
            onClick={() => {
              if (el.kind === 'view') onSelectView(el.id)
              else onSelectArtifact(el.id)
            }}
            title={el.id}
          >
            <span className="artifact-kind">{el.kind}</span> {el.name}
            {isView && el.typeRef ? (
              <span className="view-type-ref">«{el.typeRef}»</span>
            ) : null}
          </button>
        </div>
        {hasChildren && !collapsed
          ? childIds.map((cid) => render(byId[cid], depth + 1))
          : null}
      </div>
    )
  }

  if (!roots.length) {
    return <p className="muted">No definitions yet.</p>
  }

  const renderFolder = (name: string, folderRoots: SemanticElement[]) => {
    const folderKey = `folder::${name}`
    const collapsed = folderCollapsed.has(folderKey)
    return (
      <div key={folderKey} className="tree-item">
        <div className="tree-row is-folder">
          <button
            type="button"
            className="tree-expand-btn"
            aria-expanded={!collapsed}
            onClick={() => toggleFolder(folderKey)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <span className="tree-label folder-label">{name}/</span>
        </div>
        {!collapsed
          ? folderRoots.map((el) => render(el, 1))
          : null}
      </div>
    )
  }

  return (
    <div className="view-tree">
      {folderGroups.folders.map(({ name, roots: folderRoots }) =>
        renderFolder(name, folderRoots),
      )}
      {folderGroups.ungrouped.map((el) => render(el, 0))}
    </div>
  )
}

function FileTree({
  nodes,
  depth,
  onShowText,
  onShowMarkdown,
  onRefreshFile,
  onContextMenu,
}: {
  nodes: FileTreeNode[]
  depth: number
  onShowText: (fileId: string) => void
  onShowMarkdown: (path: string) => void
  onRefreshFile: (fileId: string) => void
  onContextMenu: (file: SysmlFile, x: number, y: number) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const isCollapsed = collapsed.has(node.path)
          return (
            <div key={node.path} className="tree-item" style={{ paddingLeft: depth * 12 }}>
              <div className="tree-row is-folder">
                <button
                  type="button"
                  className="tree-expand-btn"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(node.path)}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
                <span className="tree-label folder-label">{node.name}/</span>
              </div>
              {!isCollapsed ? (
                <FileTree
                  nodes={node.children}
                  depth={depth + 1}
                  onShowText={onShowText}
                  onShowMarkdown={onShowMarkdown}
                  onRefreshFile={onRefreshFile}
                  onContextMenu={onContextMenu}
                />
              ) : null}
            </div>
          )
        }
        if (node.kind === 'markdown') {
          return (
            <div key={node.path} className="tree-item" style={{ paddingLeft: depth * 12 }}>
              <div className="tree-row is-doc">
                <span className="tree-expand-btn spacer" aria-hidden />
                <button
                  type="button"
                  className="tree-label"
                  onClick={() => onShowMarkdown(node.path)}
                  title={node.path}
                >
                  <span className="artifact-kind">md</span> {node.name}
                </button>
              </div>
            </div>
          )
        }
        const file = node.file
        return (
          <div
            key={node.path}
            className="tree-item file-tree-item"
            style={{ paddingLeft: depth * 12 }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onContextMenu(file, e.clientX, e.clientY)
            }}
          >
            <div className="tree-row is-file">
              <span className="tree-expand-btn spacer" aria-hidden />
              <button
                type="button"
                className="tree-label"
                onClick={() => onShowText(file.id)}
                title={file.path || file.name}
              >
                <span className="artifact-kind">sysml</span> {node.name}
              </button>
              {file.warnings.length > 0 ? (
                <span className="file-warnings-inline" title={file.warnings.join('\n')}>
                  {file.warnings.length}
                </span>
              ) : null}
              <button
                type="button"
                className="file-refresh-inline"
                onClick={() => onRefreshFile(file.id)}
                title="Refresh from disk"
              >
                ↻
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function LeftSidebar({
  project,
  docPaths,
  activeTab,
  onTabChange,
  activeViewId,
  selectedArtifactId,
  onSelectView,
  onSelectArtifact,
  onAddFilePath,
  onRefreshFile,
  onDeleteFile,
  onShowText,
  onShowMarkdown,
}: Props) {
  const [menu, setMenu] = useState<{
    fileId: string
    x: number
    y: number
  } | null>(null)

  const fileTree = useMemo(
    () => buildFileTree(project?.files || [], docPaths),
    [project?.files, docPaths],
  )

  return (
    <aside className="sidebar left-sidebar" onClick={() => setMenu(null)}>
      <div className="tab-bar">
        <button
          type="button"
          className={activeTab === 'views' ? 'active' : ''}
          onClick={() => onTabChange('views')}
        >
          Views
        </button>
        <button
          type="button"
          className={activeTab === 'files' ? 'active' : ''}
          onClick={() => onTabChange('files')}
        >
          Files
        </button>
      </div>

      {activeTab === 'views' && (
        <div className="sidebar-body">
          <ViewTree
            semantic={project?.semantic || {}}
            selectedId={selectedArtifactId}
            activeViewId={activeViewId}
            onSelectArtifact={onSelectArtifact}
            onSelectView={onSelectView}
          />
        </div>
      )}

      {activeTab === 'files' && (
        <div className="sidebar-body files-panel">
          <button type="button" className="upload-zone" onClick={() => onAddFilePath()}>
            <span>Add SysML file by relative path…</span>
          </button>
          <div className="file-tree view-tree">
            {fileTree.length ? (
              <FileTree
                nodes={fileTree}
                depth={0}
                onShowText={onShowText}
                onShowMarkdown={onShowMarkdown}
                onRefreshFile={onRefreshFile}
                onContextMenu={(file, x, y) => setMenu({ fileId: file.id, x, y })}
              />
            ) : (
              <p className="muted">No files yet.</p>
            )}
          </div>
          <p className="muted hint">Right-click a SysML file for Refresh / View as text</p>
        </div>
      )}

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onRefreshFile(menu.fileId)
              setMenu(null)
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              onShowText(menu.fileId)
              setMenu(null)
            }}
          >
            View as text
          </button>
          {onDeleteFile && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm('Remove this SysML file from the project?')) {
                  onDeleteFile(menu.fileId)
                }
                setMenu(null)
              }}
            >
              Delete file
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
