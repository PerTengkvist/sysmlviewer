import { useEffect, useRef } from 'react'
import type { RequirementDisplaySettings } from '../../settings'
import { DetailsPanel, type DetailsPanelProps } from './DetailsPanel'
import { DocumentationPanel } from './DocumentationPanel'
import {
  resizedTo,
  toggleMaximized,
  type ElementDialogSize,
} from './elementDialogState'

type Props = {
  elementId: string
  size: ElementDialogSize
  onSizeChange: (next: ElementDialogSize) => void
  onClose: () => void
  /** Same props the right sidebar's DetailsPanel gets; selectedId is overridden. */
  detailsProps: DetailsPanelProps
  /** Project documentation paths — needed for package-qualified .md resolution. */
  docPaths?: readonly string[]
  requirementDisplay?: RequirementDisplaySettings
}

/**
 * Double-click dialog: Details on the left, Documentation on the right.
 * Resizable via native `resize: both` (clamped to the viewport by CSS);
 * the observed size is written back through `onSizeChange`.
 */
export function ElementDialog({
  elementId,
  size,
  onSizeChange,
  onClose,
  detailsProps,
  docPaths,
  requirementDisplay,
}: Props) {
  const el = detailsProps.project?.semantic[elementId]
  const label = `${el?.kind ?? 'element'} ${el?.name ?? elementId}`
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const node = dialogRef.current
    if (!node || size.maximized || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      const width = Math.round(node.offsetWidth)
      const height = Math.round(node.offsetHeight)
      if (Math.abs(width - size.width) < 2 && Math.abs(height - size.height) < 2) {
        return
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        onSizeChange(
          resizedTo(size, width, height, {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        ),
      )
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [size, onSizeChange])

  return (
    <div className="element-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`element-dialog${size.maximized ? ' is-maximized' : ''}`}
        role="dialog"
        aria-label={label}
        style={
          size.maximized ? undefined : { width: size.width, height: size.height }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header element-dialog-header">
          <h2>
            <span className="artifact-kind">{el?.kind ?? 'element'}</span>{' '}
            {el?.name ?? elementId}
          </h2>
          <span className="element-dialog-actions">
            <button
              type="button"
              aria-label={size.maximized ? 'Restore' : 'Maximize'}
              title={size.maximized ? 'Restore size' : 'Maximize to window'}
              onClick={() => onSizeChange(toggleMaximized(size))}
            >
              {size.maximized ? '🗗' : '🗖'}
            </button>
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </span>
        </header>
        <div className="element-dialog-body">
          <div className="element-dialog-pane is-details">
            <DetailsPanel
              {...detailsProps}
              selectedId={elementId}
              selectedIds={[elementId]}
            />
          </div>
          <div className="element-dialog-pane is-docs">
            <DocumentationPanel
              project={detailsProps.project}
              selectedId={elementId}
              docPaths={docPaths}
              requirementDisplay={requirementDisplay}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
