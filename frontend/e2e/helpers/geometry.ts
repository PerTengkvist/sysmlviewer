import type { Page } from '@playwright/test'
import {
  computeLayoutQuality,
  overlappingPairs,
  type LayoutQualityMetrics,
  type QualityPolyline,
  type QualityRect,
} from '../../src/features/diagram/layout/layoutQuality'
import {
  allowedPortSides,
  inferPortFlowRole,
  type PortPlacementMode,
} from '../../src/features/diagram/layout/autoLayoutOptions'
import type { PortSide } from '../../src/api'

export type DomPort = {
  id: string
  name: string
  side: PortSide
  boundary: boolean
}

/** Read every part port (id, name, side) from the rendered handles. */
export async function readPortSides(page: Page): Promise<DomPort[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.react-flow__handle[data-port-id]'),
    ).map((el) => ({
      id: el.getAttribute('data-port-id') || '',
      name: el.getAttribute('data-port-name') || '',
      side: (el.getAttribute('data-port-side') || 'right') as
        | 'left'
        | 'right'
        | 'top'
        | 'bottom',
      boundary: el.getAttribute('data-port-boundary') === 'true',
    })),
  )
}

export type PortSideReport = {
  portSides: Record<PortSide, number>
  /** Ports (id@side) on a side the port placement mode forbids. */
  portSideViolations: string[]
}

/**
 * Check the port placement contract. The flow role comes from the port name
 * only (…In / …Out), so link-derived roles are treated as unknown, which is
 * never stricter than the layout's own view.
 */
export function evaluatePortSides(
  ports: DomPort[],
  mode: PortPlacementMode,
): PortSideReport {
  const portSides: Record<PortSide, number> = { left: 0, right: 0, top: 0, bottom: 0 }
  const portSideViolations: string[] = []
  for (const p of ports) {
    if (p.boundary) continue
    portSides[p.side] += 1
    const role = inferPortFlowRole({ id: p.id, name: p.name }, [])
    if (!allowedPortSides(mode, role).includes(p.side)) {
      portSideViolations.push(`${p.id}@${p.side}`)
    }
  }
  return { portSides, portSideViolations }
}

export type DiagramGeometry = {
  rects: QualityRect[]
  polylines: QualityPolyline[]
}

/** Parse an SVG path (M/L/H/V/A) into its vertex list in flow coordinates. */
export function parsePathPoints(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  const tokens = d.match(/[MLHVAZmlhvaz]|-?\d*\.?\d+(?:e-?\d+)?/g) || []
  let cmd = ''
  let i = 0
  let cur = { x: 0, y: 0 }
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t
      i += 1
      if (cmd === 'Z' || cmd === 'z') continue
    }
    switch (cmd) {
      case 'M':
      case 'L':
        cur = { x: num(), y: num() }
        pts.push(cur)
        break
      case 'H':
        cur = { x: num(), y: cur.y }
        pts.push(cur)
        break
      case 'V':
        cur = { x: cur.x, y: num() }
        pts.push(cur)
        break
      case 'A':
        // rx ry rot large sweep x y — keep only the arc end point.
        num()
        num()
        num()
        num()
        num()
        cur = { x: num(), y: num() }
        pts.push(cur)
        break
      default:
        i += 1
    }
  }
  return pts
}

/** Read part rectangles (absolute flow coords) and edge polylines from the DOM. */
export async function readDiagramGeometry(page: Page): Promise<DiagramGeometry> {
  const raw = await page.evaluate(() => {
    const nodes: {
      id: string
      x: number
      y: number
      w: number
      h: number
      cls: string
    }[] = []
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('.react-flow__node'),
    )) {
      const id = el.getAttribute('data-id') || ''
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
        el.style.transform || '',
      )
      if (!id || !m) continue
      nodes.push({
        id,
        x: Number(m[1]),
        y: Number(m[2]),
        w: el.offsetWidth,
        h: el.offsetHeight,
        cls: el.className,
      })
    }
    const edges: { id: string; label: string; d: string }[] = []
    for (const g of Array.from(
      document.querySelectorAll<SVGGElement>('.react-flow__edge'),
    )) {
      const id = g.getAttribute('data-id') || ''
      const label = g.getAttribute('aria-label') || ''
      const path =
        g.querySelector<SVGPathElement>('path.react-flow__edge-path') ||
        g.querySelector<SVGPathElement>('path[d]')
      const d = path?.getAttribute('d') || ''
      if (id && d) edges.push({ id, label, d })
    }
    return { nodes, edges }
  })

  const rects: QualityRect[] = raw.nodes
    .filter((n) => n.cls.includes('react-flow__node-part'))
    .map((n) => ({
      id: n.id,
      minX: n.x,
      minY: n.y,
      maxX: n.x + n.w,
      maxY: n.y + n.h,
    }))

  const polylines: QualityPolyline[] = []
  for (const e of raw.edges) {
    const m = /^Edge from (.+) to (.+)$/.exec(e.label)
    const points = parsePathPoints(e.d)
    if (points.length < 2) continue
    polylines.push({
      id: e.id,
      points,
      endpoints: m ? [m[1], m[2]] : ['', ''],
    })
  }
  return { rects, polylines }
}

/** parentId per part from the view payload (semantic model). */
export async function readParentOf(
  page: Page,
  projectId: string,
  viewId: string,
): Promise<Map<string, string | undefined>> {
  const res = await page.request.get(
    `/api/projects/${encodeURIComponent(projectId)}/views/${encodeURIComponent(viewId)}?levels=9`,
  )
  const payload = (await res.json()) as {
    semantic: Record<string, { parentId?: string | null }>
  }
  const out = new Map<string, string | undefined>()
  for (const [id, el] of Object.entries(payload.semantic || {})) {
    out.set(id, el.parentId || undefined)
  }
  return out
}

export type EvaluationReport = LayoutQualityMetrics & {
  parts: number
  edges: number
  overlapPairs: [string, string][]
  outsideParent: string[]
}

export function evaluateGeometry(
  geo: DiagramGeometry,
  parentOf: Map<string, string | undefined>,
): EvaluationReport {
  const byId = new Map(geo.rects.map((r) => [r.id, r]))
  const outsideParent: string[] = []
  for (const r of geo.rects) {
    const p = parentOf.get(r.id)
    const pr = p ? byId.get(p) : undefined
    if (!pr) continue
    if (
      r.minX < pr.minX - 0.5 ||
      r.minY < pr.minY - 0.5 ||
      r.maxX > pr.maxX + 0.5 ||
      r.maxY > pr.maxY + 0.5
    ) {
      outsideParent.push(r.id)
    }
  }
  const metrics = computeLayoutQuality(geo.rects, geo.polylines, { parentOf })
  return {
    ...metrics,
    parts: geo.rects.length,
    edges: geo.polylines.length,
    overlapPairs: overlappingPairs(geo.rects, { parentOf }),
    outsideParent,
  }
}
