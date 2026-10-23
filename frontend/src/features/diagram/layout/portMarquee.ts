/**
 * Option+Shift rectangle selection for ports (flow coordinates).
 */
import type { Node } from '@xyflow/react'
import type { PortSide } from '../../../api'
import { absoluteNodeOrigin } from '../modes/structure/buildStructureGraph'
import { portPointOnPart } from './distributePorts'

export type FlowRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ScreenPoint = { x: number; y: number }

/** Normalize two corners into a positive-size rect. */
export function rectFromCorners(a: ScreenPoint, b: ScreenPoint): FlowRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function pointInRect(
  px: number,
  py: number,
  rect: FlowRect,
  pad = 0,
): boolean {
  return (
    px >= rect.x - pad &&
    px <= rect.x + rect.width + pad &&
    py >= rect.y - pad &&
    py <= rect.y + rect.height + pad
  )
}

type PortLike = { id: string; side: PortSide; offset: number }

function nodeSize(node: Node): { width: number; height: number } {
  return {
    width:
      Number(node.style?.width ?? node.width ?? node.measured?.width) || 180,
    height:
      Number(node.style?.height ?? node.height ?? node.measured?.height) || 120,
  }
}

/** Absolute flow position of a port handle center. */
export function portFlowPoint(
  node: Node,
  port: PortLike,
  byId: Map<string, Node>,
): { x: number; y: number } {
  const origin = absoluteNodeOrigin(node, byId)
  const size = nodeSize(node)
  const local = portPointOnPart(port.side, port.offset, size)
  return { x: origin.x + local.x, y: origin.y + local.y }
}

/**
 * Port ids whose handle centers lie inside `rect` (flow space).
 * `pad` expands the hit area slightly (flow px).
 */
export function collectPortsInFlowRect(
  nodes: Node[],
  rect: FlowRect,
  pad = 4,
): string[] {
  if (rect.width < 1 && rect.height < 1) return []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: string[] = []
  for (const node of nodes) {
    const data = node.data as { ports?: PortLike[] } | undefined
    const ports = data?.ports
    if (!ports?.length) continue
    for (const port of ports) {
      const p = portFlowPoint(node, port, byId)
      if (pointInRect(p.x, p.y, rect, pad)) out.push(port.id)
    }
  }
  return out
}

export type ScreenRect = {
  left: number
  top: number
  width: number
  height: number
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: ScreenRect,
): boolean {
  const br = b.left + b.width
  const bb = b.top + b.height
  return a.left <= br && a.right >= b.left && a.top <= bb && a.bottom >= b.top
}

/**
 * Port ids whose visible source handles intersect a screen-space marquee.
 * Uses DOM geometry so zoom/pan/nesting cannot desync hit-testing.
 */
export function collectPortsInScreenRect(
  portIds: Iterable<string>,
  rect: ScreenRect,
  root: ParentNode = document,
): string[] {
  if (rect.width < 1 && rect.height < 1) return []
  const wanted = new Set(portIds)
  if (!wanted.size) return []
  const out: string[] = []
  const handles = root.querySelectorAll?.('.react-flow__handle[data-handleid]')
  if (!handles) return out
  handles.forEach((node) => {
    const el = node as HTMLElement
    const id = el.getAttribute('data-handleid')
    if (!id || !wanted.has(id)) return
    const r = el.getBoundingClientRect()
    if (
      rectsIntersect(
        { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        rect,
      )
    ) {
      out.push(id)
    }
  })
  return out
}

/** All port ids currently present on flow nodes. */
export function allPortIdsFromNodes(nodes: Node[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    const ports = (node.data as { ports?: PortLike[] } | undefined)?.ports
    if (!ports?.length) continue
    for (const p of ports) out.push(p.id)
  }
  return out
}
