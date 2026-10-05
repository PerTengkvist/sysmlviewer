import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, type Project } from '../../api'
import type { RequirementDisplaySettings } from '../../settings'
import {
  DEFAULT_REQUIREMENT_DISPLAY,
  resolveRequirementDocPanel,
} from '../diagram/requirementDisplay'
import { docPathForArtifact } from '../docs/docPath'

type Props = {
  project: Project | null
  selectedId: string | null
  requirementDisplay?: RequirementDisplaySettings
}

export function DocumentationPanel({
  project,
  selectedId,
  requirementDisplay = DEFAULT_REQUIREMENT_DISPLAY,
}: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [attrFallback, setAttrFallback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!project || !selectedId) {
      setContent(null)
      setDocPath(null)
      setAttrFallback(null)
      setError(null)
      return
    }
    const el = project.semantic[selectedId]
    const path = docPathForArtifact(el)
    setDocPath(path)

    const applyRequirementFallback = (hasMd: boolean) => {
      if (!el || el.kind !== 'requirement') {
        setAttrFallback(null)
        return
      }
      setAttrFallback(
        resolveRequirementDocPanel(
          el,
          project.semantic,
          requirementDisplay,
          hasMd,
        ),
      )
    }

    if (!path) {
      setContent(null)
      applyRequirementFallback(false)
      if (el?.kind === 'requirement') {
        setError(null)
      } else {
        setError(el ? 'No documentation path for this artifact.' : null)
      }
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setAttrFallback(null)
    void api
      .fetchDocumentation(project.id, path)
      .then((doc) => {
        if (cancelled) return
        setContent(doc.content)
        setAttrFallback(null)
      })
      .catch(() => {
        if (cancelled) return
        setContent(null)
        if (el?.kind === 'requirement') {
          applyRequirementFallback(false)
          setError(null)
        } else {
          setAttrFallback(null)
          setError(`Documentation not found: ${path}`)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project, selectedId, requirementDisplay])

  return (
    <div className="documentation-panel">
      <div className="panel-section-header">Documentation</div>
      {!project || !selectedId ? (
        <p className="muted">Select an artifact to view its documentation.</p>
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : content ? (
        <div className="markdown-body">
          {docPath ? <div className="doc-path muted">{docPath}</div> : null}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : attrFallback ? (
        <div className="markdown-body">
          <div className="doc-path muted">
            Attribute: {requirementDisplay.documentationPanelAttribute}
          </div>
          <pre className="requirement-doc-attr">{attrFallback}</pre>
        </div>
      ) : error ? (
        <p className="muted">{error}</p>
      ) : (
        <p className="muted">No documentation available.</p>
      )}
    </div>
  )
}
