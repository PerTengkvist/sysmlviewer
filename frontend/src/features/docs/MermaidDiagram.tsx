import { useEffect, useId, useState } from 'react'

type Props = {
  source: string
}

function mermaidTheme(): 'neutral' | 'dark' {
  if (typeof document === 'undefined') return 'neutral'
  const theme = document.documentElement.getAttribute('data-theme')
  return theme === 'dark' ? 'dark' : 'neutral'
}

function useDocumentTheme(): 'neutral' | 'dark' {
  const [theme, setTheme] = useState<'neutral' | 'dark'>('neutral')
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(mermaidTheme())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export function MermaidDiagram({ source }: Props) {
  const reactId = useId().replace(/:/g, '')
  const theme = useDocumentTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const chart = source.trim()
    if (!chart) {
      setSvg(null)
      setError(null)
      return
    }

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme,
          fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        })
        const { svg: rendered } = await mermaid.render(
          `mermaid-${reactId}`,
          chart,
        )
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [source, reactId, theme])

  if (error) {
    return (
      <div
        className="mermaid-diagram mermaid-diagram-error"
        data-mermaid-source={source}
        role="alert"
      >
        <pre className="mermaid-source">{source}</pre>
        <p className="mermaid-error-message muted">{error}</p>
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        className="mermaid-diagram mermaid-diagram-loading muted"
        data-mermaid-source={source}
      >
        Rendering diagram…
      </div>
    )
  }

  return (
    <div
      className="mermaid-diagram"
      data-mermaid-source={source}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
