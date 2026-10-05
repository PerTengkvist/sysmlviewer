import {
  DEFAULT_REQUIREMENT_DISPLAY,
  normalizeRequirementDisplay,
  type RequirementDisplaySettings,
} from './features/diagram/requirementDisplay'

/** Matches `.edge-label { font-size: 11px }`. Parallel wires keep at least this gap. */
export const EDGE_LABEL_TEXT_HEIGHT_PX = 11

export type AppMode = 'viewer' | 'editor'
export type ViewMode = 'light' | 'dark'

export type StructureNotation = 'sysmlv2' | 'arcadia'

export type { RequirementDisplaySettings }

export type AppSettings = {
  mode: AppMode
  viewMode: ViewMode
  showDiagramDetails: {
    attributes: boolean
    hierarchicalLevels: number
    /** GeneralView structure presentation. */
    structureNotation: StructureNotation
  }
  /** How requirement nodes show header, body, and doc-panel fallback. */
  requirementDisplay: RequirementDisplaySettings
  /** Selected connection highlight color. */
  selectedConnectionColor: string
  /** Multiplier applied to the edge's own stroke width when selected. */
  selectedConnectionLinewidthFactor: number
  /** Pending relation todo: change overlay color. */
  pendingChangeColor: string
  /** Pending relation todo: add overlay color. */
  pendingAddColor: string
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

function cloneRequirementDisplay(): RequirementDisplaySettings {
  return {
    headerSlots: [
      { ...DEFAULT_REQUIREMENT_DISPLAY.headerSlots[0] },
      { ...DEFAULT_REQUIREMENT_DISPLAY.headerSlots[1] },
    ],
    body: { ...DEFAULT_REQUIREMENT_DISPLAY.body },
    documentationPanelAttribute:
      DEFAULT_REQUIREMENT_DISPLAY.documentationPanelAttribute,
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'viewer',
  viewMode: 'light',
  showDiagramDetails: {
    attributes: false,
    hierarchicalLevels: 2,
    structureNotation: 'sysmlv2',
  },
  requirementDisplay: cloneRequirementDisplay(),
  selectedConnectionColor: '#2563eb',
  selectedConnectionLinewidthFactor: 3,
  pendingChangeColor: '#dc2626',
  pendingAddColor: '#16a34a',
  connectionSeparation: EDGE_LABEL_TEXT_HEIGHT_PX,
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
        requirementDisplay: cloneRequirementDisplay(),
      }
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      selectedConnectionLinewidth?: number
    }
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
      requirementDisplay: normalizeRequirementDisplay(parsed.requirementDisplay),
      selectedConnectionColor:
        typeof parsed.selectedConnectionColor === 'string' &&
        parsed.selectedConnectionColor
          ? parsed.selectedConnectionColor
          : DEFAULT_SETTINGS.selectedConnectionColor,
      selectedConnectionLinewidthFactor: (() => {
        const raw = Number(parsed.selectedConnectionLinewidthFactor)
        if (!Number.isFinite(raw)) {
          return DEFAULT_SETTINGS.selectedConnectionLinewidthFactor
        }
        return Math.max(1, raw)
      })(),
      pendingChangeColor:
        typeof parsed.pendingChangeColor === 'string' && parsed.pendingChangeColor
          ? parsed.pendingChangeColor
          : DEFAULT_SETTINGS.pendingChangeColor,
      pendingAddColor:
        typeof parsed.pendingAddColor === 'string' && parsed.pendingAddColor
          ? parsed.pendingAddColor
          : DEFAULT_SETTINGS.pendingAddColor,
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
      requirementDisplay: cloneRequirementDisplay(),
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
