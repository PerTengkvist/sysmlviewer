import { useEffect, useState } from 'react'
import { api, type DependencyTree, type SemanticElement } from '../../api'
import {
  DEFAULT_ELEMENT_DIALOG_SIZE,
  toggleMaximized,
  type ElementDialogSize,
} from '../details/elementDialogState'
import { elementDisplayName } from '../details/elementRelations'
import { DependencyTreeView } from './DependencyTreeView'

type Props = {
  projectId: string
  elementId: string
  semantic: Record<string, SemanticElement>
  onClose: () => void
  /** Open an element clicked in the tree (the dialog closes first). */
  onOpenElement: (artifactId: string) => void
}

/** Modal with the dependency tree of one element, fetched from the API. */
export function DependencyTreeDialog({
  projectId,
  elementId,
  semantic,
  onClose,
  onOpenElement,
}: Props) {
  const [tree, setTree] = useState<DependencyTree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<ElementDialogSize>(DEFAULT_ELEMENT_DIALOG_SIZE)
  const name = elementDisplayName(semantic[elementId], elementId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setTree(null)
    setError(null)
    void api
      .getDependencyTree(projectId, elementId)
      .then((t) => {
        if (!cancelled) setTree(t)
      })
      .catch(() => {
        if (!cancelled) setError(`Could not load the dependency tree of ${name}`)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, elementId, name])

  const open = (id: string) => {
    onClose()
    onOpenElement(id)
  }

  return (
    <div className="element-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`element-dialog dependency-tree-dialog${size.maximized ? ' is-maximized' : ''}`}
        role="dialog"
        aria-label={`Dependency tree ${name}`}
        style={size.maximized ? undefined : { width: size.width, height: size.height }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header element-dialog-header">
          <h2>
            <span className="artifact-kind">dependency tree</span> {name}
          </h2>
          <span className="element-dialog-actions">
            <button
              type="button"
              aria-label={size.maximized ? 'Restore' : 'Maximize'}
              title={size.maximized ? 'Restore size' : 'Maximize to window'}
              onClick={() => setSize(toggleMaximized(size))}
            >
              {size.maximized ? '🗗' : '🗖'}
            </button>
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </span>
        </header>
        <div className="element-dialog-body dependency-tree-body">
          {error ? (
            <p className="muted">{error}</p>
          ) : tree ? (
            <DependencyTreeView tree={tree} onOpenElement={open} />
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </div>
    </div>
  )
}
