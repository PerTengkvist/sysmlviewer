import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../api'
import { markdownComponents } from './markdownComponents'

type Props = {
  tutorialId: string
  title?: string
  onClose?: () => void
}

export function TutorialMarkdown({ tutorialId, title, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .getTutorial(tutorialId)
      .then((doc) => {
        if (!cancelled) setContent(doc.content)
      })
      .catch(() => {
        if (!cancelled) setError(`Could not load tutorial ${tutorialId}`)
      })
    return () => {
      cancelled = true
    }
  }, [tutorialId])

  return (
    <div className="text-canvas markdown-canvas">
      <div className="text-canvas-toolbar">
        <strong>{title || tutorialId}</strong>
        {onClose ? (
          <button type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="muted">{error}</p>
      ) : content ? (
        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </div>
  )
}
