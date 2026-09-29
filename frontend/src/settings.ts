export type AppMode = 'viewer' | 'editor'
export type ViewMode = 'light' | 'dark'

export type StructureNotation = 'sysmlv2' | 'arcadia'

export type AppSettings = {
  mode: AppMode
  viewMode: ViewMode
  showDiagramDetails: {
    attributes: boolean
    hierarchicalLevels: number
    /** GeneralView structure presentation. */
    structureNotation: StructureNotation
  }
  /** Selected connection highlight (GeneralView / structure). */
  selectedConnectionColor: string
  selectedConnectionLinewidth: number
  /**
   * Min gap (flow px at 100% zoom) between unrelated connection tracks.
   * Related nets (shared port) may still coincide.
   */
  connectionSeparation: number
  /** Panel sizes as percentages [left, center, right]. */
  horizontalPanelSizes: [number, number, number]
  /** Right sidebar split [details, documentation] percentages. */
  rightPanelSizes: [number, number]
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'viewer',
  viewMode: 'light',
  showDiagramDetails: {
    attributes: false,
    hierarchicalLevels: 2,
    structureNotation: 'sysmlv2',
  },
  selectedConnectionColor: '#2563eb',
  selectedConnectionLinewidth: 4,
  connectionSeparation: 5,
  horizontalPanelSizes: [18, 64, 18],
  rightPanelSizes: [50, 50],
}

const KEY = 'sysmlviewer.settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw)
      return {
        ...DEFAULT_SETTINGS,
        showDiagramDetails: { ...DEFAULT_SETTINGS.showDiagramDetails },
      }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      mode: 'viewer',
      viewMode: parsed.viewMode === 'dark' ? 'dark' : 'light',
      showDiagramDetails: {
        attributes: !!parsed.showDiagramDetails?.attributes,
        hierarchicalLevels: Math.max(
          1,
          Number(parsed.showDiagramDetails?.hierarchicalLevels) || 2,
        ),
        structureNotation:
          parsed.showDiagramDetails?.structureNotation === 'arcadia'
            ? 'arcadia'
            : 'sysmlv2',
      },
      selectedConnectionColor:
        typeof parsed.selectedConnectionColor === 'string' &&
        parsed.selectedConnectionColor
          ? parsed.selectedConnectionColor
          : DEFAULT_SETTINGS.selectedConnectionColor,
      selectedConnectionLinewidth: Math.max(
        1,
        Number(parsed.selectedConnectionLinewidth) ||
          DEFAULT_SETTINGS.selectedConnectionLinewidth,
      ),
      connectionSeparation: Math.max(
        0,
        Number(parsed.connectionSeparation) ||
          DEFAULT_SETTINGS.connectionSeparation,
      ),
      horizontalPanelSizes: normalizeTriple(
        parsed.horizontalPanelSizes,
        DEFAULT_SETTINGS.horizontalPanelSizes,
      ),
      rightPanelSizes: normalizePair(
        parsed.rightPanelSizes,
        DEFAULT_SETTINGS.rightPanelSizes,
      ),
    }
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      showDiagramDetails: { ...DEFAULT_SETTINGS.showDiagramDetails },
    }
  }
}

function normalizePair(
  raw: unknown,
  fallback: [number, number],
): [number, number] {
  if (!Array.isArray(raw) || raw.length !== 2) return fallback
  const a = Number(raw[0])
  const b = Number(raw[1])
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) return fallback
  return [a, b]
}

function normalizeTriple(
  raw: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3) return fallback
  const nums = raw.map(Number)
  if (nums.some((n) => !Number.isFinite(n)) || nums.reduce((s, n) => s + n, 0) <= 0) {
    return fallback
  }
  return nums as [number, number, number]
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function applyTheme(viewMode: ViewMode): void {
  document.documentElement.setAttribute('data-theme', viewMode)
}
