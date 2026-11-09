import type { ElementStyle } from '../../api'
import type { ViewMode } from '../../settings'
import { resolveModeStyle } from './elementStyle'

/** Where a port is drawn on the flow, so it can be grabbed above everything else. */
export type PortGrabTarget = {
  portId: string
  x: number
  y: number
  width: number
  height: number
  selected: boolean
  background: string | undefined
  borderColor: string | undefined
}

type HandleBounds = { id?: string | null; x: number; y: number; width: number; height: number }

/** The parts of a React Flow internal node that place its ports. */
type NodeWithPorts = {
  hidden?: boolean
  data: Record<string, unknown>
  internals: {
    positionAbsolute: { x: number; y: number }
    handleBounds?: { source?: HandleBounds[] | null } | null
  }
}

type PortData = { id: string; style?: ElementStyle | null }

/** Port fill and border, as the part draws them. Undefined keeps the default look. */
export function portHandleColors(
  portStyle: ElementStyle | null | undefined,
  partStyle: ElementStyle | null | undefined,
  viewMode: ViewMode,
): { background: string | undefined; borderColor: string | undefined } {
  const port = resolveModeStyle(portStyle, viewMode)
  const part = resolveModeStyle(partStyle, viewMode)
  // Ports keep their own fill; they do not inherit the part's background.
  return {
    background: port.backgroundColor || undefined,
    borderColor: port.lineColor || part.lineColor || undefined,
  }
}

export function portGrabTargets(nodes: Iterable<NodeWithPorts>): PortGrabTarget[] {
  const out: PortGrabTarget[] = []
  for (const node of nodes) {
    const ports = node.data.ports as PortData[] | undefined
    if (node.hidden || !ports?.length) continue
    const bounds = new Map(
      (node.internals.handleBounds?.source ?? []).map((handle) => [handle.id, handle]),
    )
    const selected = new Set((node.data.selectedPortIds as string[] | undefined) ?? [])
    const viewMode = (node.data.viewMode as ViewMode | undefined) ?? 'light'
    const partStyle = node.data.formatStyle as ElementStyle | null | undefined
    const origin = node.internals.positionAbsolute
    for (const port of ports) {
      const handle = bounds.get(port.id)
      if (!handle) continue
      out.push({
        portId: port.id,
        x: origin.x + handle.x,
        y: origin.y + handle.y,
        width: handle.width,
        height: handle.height,
        selected: selected.has(port.id),
        ...portHandleColors(port.style, partStyle, viewMode),
      })
    }
  }
  return out
}

export function samePortGrabTargets(a: PortGrabTarget[], b: PortGrabTarget[]): boolean {
  return (
    a.length === b.length &&
    a.every((target, index) => {
      const other = b[index]!
      return (Object.keys(target) as (keyof PortGrabTarget)[]).every(
        (key) => target[key] === other[key],
      )
    })
  )
}
