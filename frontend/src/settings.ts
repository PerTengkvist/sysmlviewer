export type AppMode = 'viewer' | 'editor'
export type ViewMode = 'light' | 'dark'

export type AppSettings = {
  mode: AppMode
  viewMode: ViewMode
  showDiagramDetails: {
    attributes: boolean
    hierarchicalLevels: number
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'viewer',
  viewMode: 'light',
  showDiagramDetails: {
    attributes: false,
    hierarchicalLevels: 2,
  },
}

const KEY = 'sysmlviewer.settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, showDiagramDetails: { ...DEFAULT_SETTINGS.showDiagramDetails } }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      mode: parsed.mode === 'editor' ? 'editor' : 'viewer',
      viewMode: parsed.viewMode === 'dark' ? 'dark' : 'light',
      showDiagramDetails: {
        attributes: !!parsed.showDiagramDetails?.attributes,
        hierarchicalLevels: Math.max(
          1,
          Number(parsed.showDiagramDetails?.hierarchicalLevels) || 2,
        ),
      },
    }
  } catch {
    return { ...DEFAULT_SETTINGS, showDiagramDetails: { ...DEFAULT_SETTINGS.showDiagramDetails } }
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function applyTheme(viewMode: ViewMode): void {
  document.documentElement.setAttribute('data-theme', viewMode)
}
