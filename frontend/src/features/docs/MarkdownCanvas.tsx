import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../api'
import { createMarkdownComponents } from './markdownComponents'

type Props = {
  projectId: string | undefined
  docPath: string
  onBack: () => void
  /** Open an internal markdown link in the markdown dialog. */
  onOpenDoc?: (docPath: string) => void
}

export function MarkdownCanvas({ projectId, docPath, onBack, onOpenDoc }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const components = useMemo(() => {
    if (!onOpenDoc) return createMarkdownComponents()
    return createMarkdownComponents({
      currentDocPath: docPath,
      onOpenDoc,
    })
  }, [docPath, onOpenDoc])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
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

  return (
    <div className="text-canvas markdown-canvas">
      <div className="text-canvas-toolbar">
        <strong>{docPath}</strong>
        <button type="button" onClick={onBack}>
          Back to diagram
        </button>
      </div>
      {error ? (
        <p className="muted">{error}</p>
      ) : content ? (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </div>
  )
}
