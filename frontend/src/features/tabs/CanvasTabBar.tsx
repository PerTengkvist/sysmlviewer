import type { CanvasTab } from './canvasTabs'

type Props = {
  tabs: CanvasTab[]
  activeId: string | null
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

export function CanvasTabBar({ tabs, activeId, onActivate, onClose }: Props) {
  if (!tabs.length) return null
  return (
    <div className="canvas-tab-bar" role="tablist" aria-label="Open canvases">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`canvas-tab${tab.id === activeId ? ' active' : ''}`}
          role="tab"
          aria-selected={tab.id === activeId}
        >
          <button
            type="button"
            className="canvas-tab-label"
            onClick={() => onActivate(tab.id)}
            title={
              tab.kind === 'diagram'
                ? tab.viewId
                : tab.kind === 'tutorial'
                  ? tab.tutorialId
                  : tab.docPath
            }
          >
            {tab.title}
          </button>
          <button
            type="button"
            className="canvas-tab-close"
            aria-label={`Close ${tab.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
