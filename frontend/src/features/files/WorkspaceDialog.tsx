import { useState } from 'react'
import type { ExampleProject } from '../../api'
import { api } from '../../api'
import { normalizeFolderPath } from '../files/workspacePaths'

type Props = {
  open: boolean
  mode: 'new' | 'open'
  initialFolder?: string
  exampleProjects?: ExampleProject[]
  onClose: () => void
  onCreate: (name: string, folder: string) => void
  onOpenFolder: (folder: string) => void
  onOpenProjectFile: (projectFile: string) => void
}

export function WorkspaceDialog({
  open,
  mode,
  initialFolder = '',
  exampleProjects = [],
  onClose,
  onCreate,
  onOpenFolder,
  onOpenProjectFile,
}: Props) {
  const [name, setName] = useState('New Project')
  const [folder, setFolder] = useState(initialFolder)
  const [projectFile, setProjectFile] = useState('')
  const [openMode, setOpenMode] = useState<'folder' | 'file'>('folder')
  const [browseBusy, setBrowseBusy] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)

  if (!open) return null

  const submit = () => {
    if (mode === 'new') {
      const f = normalizeFolderPath(folder)
      if (!f || !name.trim()) return
      onCreate(name.trim(), f)
      return
    }
    if (openMode === 'folder') {
      const f = normalizeFolderPath(folder)
      if (!f) return
      onOpenFolder(f)
    } else {
      const pf = projectFile.trim()
      if (!pf) return
      onOpenProjectFile(pf)
    }
  }

  const browse = async (kind: 'folder' | 'file') => {
    setBrowseError(null)
    setBrowseBusy(true)
    try {
      const { path } = await api.browsePath(kind)
      if (!path) return
      if (kind === 'folder') {
        setFolder(path)
      } else {
        setProjectFile(path)
      }
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Could not open file dialog')
    } finally {
      setBrowseBusy(false)
    }
  }

  const pathKind: 'folder' | 'file' =
    mode === 'new' || openMode === 'folder' ? 'folder' : 'file'
  const pathValue = pathKind === 'folder' ? folder : projectFile
  const setPathValue = pathKind === 'folder' ? setFolder : setProjectFile
  const pathLabel = pathKind === 'folder' ? 'Folder path' : 'Project file'
  const pathPlaceholder =
    pathKind === 'folder'
      ? '/absolute/path/to/project'
      : '/absolute/path/to/project.json'

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label={mode === 'new' ? 'New project' : 'Open project'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{mode === 'new' ? 'New project' : 'Open project'}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          {mode === 'open' && exampleProjects.length > 0 && (
            <div className="example-projects">
              <p className="example-projects-label">Example projects</p>
              <ul className="example-projects-list">
                {exampleProjects.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpenFolder(p.folder)}>
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode === 'new' && (
            <label className="settings-row">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {mode === 'open' && (
            <label className="settings-row">
              <span>Open by</span>
              <select
                value={openMode}
                onChange={(e) => setOpenMode(e.target.value as 'folder' | 'file')}
              >
                <option value="folder">Folder</option>
                <option value="file">project.json path</option>
              </select>
            </label>
          )}
          <div className="settings-row path-input-row">
            <span>{pathLabel}</span>
            <div className="path-input-group">
              <input
                value={pathValue}
                onChange={(e) => setPathValue(e.target.value)}
                placeholder={pathPlaceholder}
                aria-label={pathLabel}
              />
              <button
                type="button"
                className="path-browse-btn"
                disabled={browseBusy}
                onClick={() => void browse(pathKind)}
                title={pathKind === 'folder' ? 'Choose folder' : 'Choose project.json'}
              >
                {browseBusy ? '…' : 'Browse…'}
              </button>
            </div>
          </div>
          {browseError && <p className="modal-error">{browseError}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={submit}>
              {mode === 'new' ? 'Create' : 'Open'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
