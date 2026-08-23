import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../api'

type Props = {
  projectId: string | undefined
  docPath: string
  onBack: () => void
}

export function MarkdownCanvas({ projectId, docPath, onBack }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </div>
  )
}
