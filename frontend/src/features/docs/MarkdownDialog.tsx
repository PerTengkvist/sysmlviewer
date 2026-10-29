import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../api'
import { createMarkdownComponents } from './markdownComponents'
import {
  resizedTo,
  toggleMaximized,
  type MarkdownDialogSize,
} from './markdownDialogState'

type Props = {
  projectId: string
  docPath: string
  size: MarkdownDialogSize
  onSizeChange: (next: MarkdownDialogSize) => void
  onClose: () => void
  /** Follow an internal doc link inside this dialog (same dialog, new path). */
  onNavigate: (docPath: string) => void
}

/**
 * Modal that loads a project markdown file via fetchDocumentation.
 * Internal .md links call onNavigate; Escape / backdrop close.
 */
export function MarkdownDialog({
  projectId,
  docPath,
  size,
  onSizeChange,
  onClose,
  onNavigate,
}: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const components = useMemo(
    () =>
      createMarkdownComponents({
        currentDocPath: docPath,
        onOpenDoc: onNavigate,
      }),
    [docPath, onNavigate],
  )

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

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    void api
      .fetchDocumentation(projectId, docPath)
      .then((doc) => {
        if (!cancelled) setContent(doc.content)
      })
      .catch(() => {
        if (!cancelled) setError(`Could not load ${docPath}`)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, docPath])

  const fileName = docPath.split('/').pop() || docPath

  return (
    <div className="element-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`element-dialog${size.maximized ? ' is-maximized' : ''}`}
        role="dialog"
        aria-label={fileName}
        style={
          size.maximized ? undefined : { width: size.width, height: size.height }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header element-dialog-header">
          <h2 title={docPath}>{fileName}</h2>
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
        <div className="element-dialog-body markdown-dialog-body">
          {error ? (
            <p className="muted">{error}</p>
          ) : content ? (
            <div className="markdown-body">
              <div className="doc-path muted">{docPath}</div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </div>
    </div>
  )
}
