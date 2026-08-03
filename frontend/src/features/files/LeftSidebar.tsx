import { useState } from 'react'
import type { Project, SemanticElement } from '../../api'

export type LeftTab = 'views' | 'files'

type Props = {
  project: Project | null
  activeTab: LeftTab
  onTabChange: (tab: LeftTab) => void
  activeViewId: string | null
  selectedArtifactId: string | null
  onSelectView: (viewId: string) => void
  onSelectArtifact: (artifactId: string) => void
  onUploadFiles: (files: FileList) => void
  onPickUpload: () => void
  onRefreshFile: (fileId: string) => void
  onExportFile: (fileId: string) => void
  onShowText: (fileId: string) => void
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
  const elements = Object.values(semantic)
  const byId = Object.fromEntries(elements.map((e) => [e.id, e]))
  const roots = elements
    .filter((e) => !e.parentId || !byId[e.parentId])
    .sort((a, b) => a.id.localeCompare(b.id))

  const render = (el: SemanticElement, depth: number) => {
    // Keep tree order stable: views first among siblings, then others by id
    const childIds = (el.children || [])
      .filter((cid) => byId[cid])
      .sort((a, b) => {
        const ka = byId[a].kind === 'view' ? 0 : 1
        const kb = byId[b].kind === 'view' ? 0 : 1
        if (ka !== kb) return ka - kb
        return a.localeCompare(b)
      })
    const active =
      selectedId === el.id ||
      activeViewId === el.id ||
      activeViewId === `artifact::${el.id}`
    return (
      <div key={el.id} className="tree-item" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          className={active ? 'active' : ''}
          onClick={() => {
            if (el.kind === 'view') onSelectView(el.id)
            else onSelectArtifact(el.id)
          }}
          title={el.id}
        >
          <span className="artifact-kind">{el.kind}</span> {el.name}
        </button>
        {childIds.map((cid) => render(byId[cid], depth + 1))}
      </div>
    )
  }

  if (!roots.length) {
    return <p className="muted">No definitions yet.</p>
  }

  return <div className="view-tree">{roots.map((el) => render(el, 0))}</div>
}

export function LeftSidebar({
  project,
  activeTab,
  onTabChange,
  activeViewId,
  selectedArtifactId,
  onSelectView,
  onSelectArtifact,
  onUploadFiles,
  onPickUpload,
  onRefreshFile,
  onExportFile,
  onShowText,
}: Props) {
  const [menu, setMenu] = useState<{
    fileId: string
    x: number
    y: number
  } | null>(null)

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
        <div
          className="sidebar-body files-panel"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files?.length) {
              onUploadFiles(e.dataTransfer.files)
            }
          }}
        >
          <button type="button" className="upload-zone" onClick={() => onPickUpload()}>
            <span>Drop .sysml files here or click to upload</span>
          </button>
          <ul className="file-list">
            {(project?.files || []).map((file) => (
              <li
                key={file.id}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ fileId: file.id, x: e.clientX, y: e.clientY })
                }}
              >
                <button type="button" className="file-name" onClick={() => onShowText(file.id)}>
                  {file.name}
                </button>
                {file.sourcePath && (
                  <div className="file-path muted" title={file.sourcePath}>
                    {file.sourcePath}
                  </div>
                )}
                <div className="file-actions">
                  <button type="button" onClick={() => onRefreshFile(file.id)} title="Refresh from file…">
                    ↻
                  </button>
                  <button type="button" onClick={() => onExportFile(file.id)} title="Export SysML…">
                    ⬇
                  </button>
                </div>
                {file.warnings.length > 0 && (
                  <div className="file-warnings" title={file.warnings.join('\n')}>
                    {file.warnings.length} warning(s)
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="muted hint">Right-click a file for Refresh / View as text</p>
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
        </div>
      )}
    </aside>
  )
}
