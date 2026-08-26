import { useState } from 'react'
import { normalizeFolderPath } from '../files/workspacePaths'

type Props = {
  open: boolean
  mode: 'new' | 'open'
  initialFolder?: string
  onClose: () => void
  onCreate: (name: string, folder: string) => void
  onOpenFolder: (folder: string) => void
  onOpenProjectFile: (projectFile: string) => void
}

export function WorkspaceDialog({
  open,
  mode,
  initialFolder = '',
  onClose,
  onCreate,
  onOpenFolder,
  onOpenProjectFile,
}: Props) {
  const [name, setName] = useState('New Project')
  const [folder, setFolder] = useState(initialFolder)
  const [projectFile, setProjectFile] = useState('')
  const [openMode, setOpenMode] = useState<'folder' | 'file'>('folder')

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
          {(mode === 'new' || openMode === 'folder') && (
            <label className="settings-row">
              <span>Folder path</span>
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="/absolute/path/to/project"
              />
            </label>
          )}
          {mode === 'open' && openMode === 'file' && (
            <label className="settings-row">
              <span>Project file</span>
              <input
                value={projectFile}
                onChange={(e) => setProjectFile(e.target.value)}
                placeholder="/absolute/path/to/project.json"
              />
            </label>
          )}
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
