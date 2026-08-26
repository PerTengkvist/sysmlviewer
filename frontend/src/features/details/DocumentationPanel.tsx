import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, type Project } from '../../api'
import { docPathForArtifact } from '../docs/docPath'

type Props = {
  project: Project | null
  selectedId: string | null
}

export function DocumentationPanel({ project, selectedId }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!project || !selectedId) {
      setContent(null)
      setDocPath(null)
      setError(null)
      return
    }
    const el = project.semantic[selectedId]
    const path = docPathForArtifact(el)
    setDocPath(path)
    if (!path) {
      setContent(null)
      setError(el ? 'No documentation path for this artifact.' : null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .fetchDocumentation(project.id, path)
      .then((doc) => {
        if (cancelled) return
        setContent(doc.content)
      })
      .catch(() => {
        if (cancelled) return
        setContent(null)
        setError(`Documentation not found: ${path}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project, selectedId])

  return (
    <div className="documentation-panel">
      <div className="panel-section-header">Documentation</div>
      {!project || !selectedId ? (
        <p className="muted">Select an artifact to view its documentation.</p>
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : content ? (
        <div className="markdown-body">
          {docPath ? <div className="doc-path muted">{docPath}</div> : null}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="muted">No documentation available.</p>
      )}
    </div>
  )
}
