/**
 * GeneralView / structure AutoLayout: size parts for port labels, place ports
 * to reduce crossings, space parts for connections + labels, then caller redraws.
 */
import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import { dependencyLayers } from './dependencyLayout'
import { packBodyOffsets } from './portPlacement'

const CHAR_W = 7.2
const TITLE_CHAR_W = 8
const PORT_ROW = 22
const PAD_TOP = 40
const PAD_BOTTOM = 14
const PAD_X = 20
const MIN_W = 140
const MIN_H = 72
const LABEL_GAP = 10
const PART_GAP_EXTRA = 96 // room for connection names / elbows

export type AutoLayoutPort = {
  id: string
  side: PortSide
  offset: number
}

export type AutoLayoutResult = {
  /** Part nodes: position + size. Port nodes: side + offset (+ keep x/y). */
  nodes: Record<string, Partial<VisualizationNode>>
}

function estimateTextWidth(text: string, charW: number): number {
  return Math.max(24, text.length * charW)
}

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

function readSize(n: Node): { width: number; height: number } {
  const w =
    (typeof n.style?.width === 'number' && n.style.width) ||
    n.width ||
    MIN_W
  const h =
    (typeof n.style?.height === 'number' && n.style.height) ||
    n.height ||
    MIN_H
  return { width: Number(w) || MIN_W, height: Number(h) || MIN_H }
}

/** Size a part so left/right port names do not overlap. */
export function sizePartForPorts(
  label: string,
  ports: { name: string; side: PortSide }[],
): { width: number; height: number } {
  const left = ports.filter((p) => p.side === 'left' || p.side === 'top')
  const right = ports.filter((p) => p.side === 'right' || p.side === 'bottom')
  // Treat top/bottom like left/right for width budget of name text inside
  const leftNames = ports.filter((p) => p.side === 'left')
  const rightNames = ports.filter((p) => p.side === 'right')
  const leftW = Math.max(
    0,
    ...leftNames.map((p) => estimateTextWidth(p.name, CHAR_W)),
  )
  const rightW = Math.max(
    0,
    ...rightNames.map((p) => estimateTextWidth(p.name, CHAR_W)),
  )
  const titleW = estimateTextWidth(label, TITLE_CHAR_W) + 36
  const width = Math.max(
    MIN_W,
    titleW,
    PAD_X * 2 + leftW + rightW + LABEL_GAP,
  )
  const rows = Math.max(left.length, right.length, 1)
  const height = Math.max(MIN_H, PAD_TOP + rows * PORT_ROW + PAD_BOTTOM)
  return { width, height }
}

type ConnLink = {
  edgeId: string
  sourcePart: string
  targetPart: string
  sourcePort: string
  targetPort: string
}

function collectLinks(edges: Edge[]): ConnLink[] {
  const out: ConnLink[] = []
  for (const e of edges) {
    const sp = portIdFromHandle(e.sourceHandle)
    const tp = portIdFromHandle(e.targetHandle)
    if (!sp || !tp) continue
    out.push({
      edgeId: e.id,
      sourcePart: e.source,
      targetPart: e.target,
      sourcePort: sp,
      targetPort: tp,
    })
  }
  return out
}

/**
 * Assign port sides: inherit parent-boundary side when linked to a parent port;
 * otherwise prefer side facing the peer part; then pack offsets without overlap.
 */
export function assignPortSidesAndOffsets(
  nodes: Node[],
  links: ConnLink[],
): Map<string, { side: PortSide; offset: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const boundary = nodes.find(isBoundary)
  const result = new Map<string, { side: PortSide; offset: number }>()

  // Index links by port
  const linksByPort = new Map<string, ConnLink[]>()
  for (const l of links) {
    for (const pid of [l.sourcePort, l.targetPort]) {
      const arr = linksByPort.get(pid) || []
      arr.push(l)
      linksByPort.set(pid, arr)
    }
  }

  for (const node of nodes) {
    if (node.type && node.type !== 'part') continue
    const ports = portsOf(node)
    if (!ports.length) continue

    type Tentative = { id: string; side: PortSide; score: number }
    const tentative: Tentative[] = []

    for (const port of ports) {
      const related = linksByPort.get(port.id) || []
      let side: PortSide = port.side
      let score = 0

      // Prefer matching parent port side when connected to boundary
      if (boundary) {
        for (const l of related) {
          const otherPart =
            l.sourcePort === port.id ? l.targetPart : l.sourcePart
          const otherPort =
            l.sourcePort === port.id ? l.targetPort : l.sourcePort
          if (otherPart !== boundary.id) continue
          const bPorts = portsOf(boundary)
          const bp = bPorts.find((p) => p.id === otherPort)
          if (bp && (bp.side === 'left' || bp.side === 'right')) {
            side = bp.side
            score = 10
            break
          }
        }
      }

      if (score < 10 && related.length) {
        // Face the peer part (horizontal preference)
        let dx = 0
        let n = 0
        for (const l of related) {
          const peerId =
            l.sourcePort === port.id ? l.targetPart : l.sourcePart
          const peer = byId.get(peerId)
          if (!peer || peer.id === node.id) continue
          const a = node.position.x + readSize(node).width / 2
          const b = peer.position.x + readSize(peer).width / 2
          dx += b - a
          n += 1
        }
        if (n > 0) {
          side = dx >= 0 ? 'right' : 'left'
          score = 5
        }
      }

      tentative.push({ id: port.id, side, score })
    }

    const left = tentative.filter((t) => t.side === 'left')
    const right = tentative.filter((t) => t.side === 'right')
    const top = tentative.filter((t) => t.side === 'top')
    const bottom = tentative.filter((t) => t.side === 'bottom')

    // Sort each side by barycenter of peer offsets along the edge
    const sortSide = (group: Tentative[], useBodyPack: boolean) => {
      group.sort((a, b) => {
        const med = (id: string) => {
          const vals: number[] = []
          for (const l of linksByPort.get(id) || []) {
            const peerPort = l.sourcePort === id ? l.targetPort : l.sourcePort
            const peerPart = l.sourcePort === id ? l.targetPart : l.sourcePart
            const peerNode = byId.get(peerPart)
            const peer = portsOf(peerNode || ({ data: {} } as Node)).find(
              (p) => p.id === peerPort,
            )
            vals.push(peer?.offset ?? 0.5)
          }
          if (!vals.length) return 0.5
          vals.sort((x, y) => x - y)
          return vals[Math.floor(vals.length / 2)]
        }
        return med(a.id) - med(b.id)
      })
      const n = Math.max(1, group.length)
      const bodyPacked = useBodyPack
        ? packBodyOffsets(n, readSize(node).height)
        : null
      group.forEach((t, i) => {
        const offset =
          bodyPacked != null
            ? bodyPacked[i]!
            : 0.15 + ((i + 0.5) / (n + 0.5)) * 0.7
        result.set(t.id, { side: t.side, offset })
      })
    }

    sortSide(left, true)
    sortSide(right, true)
    sortSide(top, false)
    sortSide(bottom, false)
  }

  return result
}

function placeParts(
  nodes: Node[],
  links: ConnLink[],
  sizes: Map<string, { width: number; height: number }>,
): Map<string, { x: number; y: number }> {
  const boundary = nodes.find(isBoundary)
  const children = nodes.filter((n) => !isBoundary(n) && (n.type === 'part' || !n.type))
  const positions = new Map<string, { x: number; y: number }>()

  const childIds = children.map((n) => n.id)
  const layers = dependencyLayers(
    childIds,
    links.map((l) => ({ source: l.sourcePart, target: l.targetPart })),
  )

  const layerWidths = layers.map((layer) =>
    layer.reduce((s, id) => s + (sizes.get(id)?.width || MIN_W), 0),
  )
  const layerHeights = layers.map((layer) =>
    Math.max(...layer.map((id) => sizes.get(id)?.height || MIN_H), MIN_H),
  )

  const padX = 48
  const padY = 56
  let xCursor = padX
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]
    const maxH = layerHeights[li]
    let yCursor = padY
    const colW = Math.max(...layer.map((id) => sizes.get(id)?.width || MIN_W), MIN_W)
    for (const id of layer) {
      const sz = sizes.get(id) || { width: MIN_W, height: MIN_H }
      positions.set(id, { x: xCursor, y: yCursor })
      yCursor += sz.height + Math.max(PART_GAP_EXTRA, maxH * 0.35)
    }
    const nextGap = Math.max(
      PART_GAP_EXTRA,
      colW * 0.55,
      ...(li + 1 < layers.length
        ? [Math.max(...layers[li + 1].map((id) => sizes.get(id)?.width || MIN_W)) * 0.55]
        : []),
    )
    xCursor += colW + nextGap
  }

  if (boundary) {
    let maxX = padX
    let maxY = padY
    for (const [id, pos] of positions) {
      const sz = sizes.get(id) || { width: MIN_W, height: MIN_H }
      maxX = Math.max(maxX, pos.x + sz.width)
      maxY = Math.max(maxY, pos.y + sz.height)
    }
    positions.set(boundary.id, { x: boundary.position.x, y: boundary.position.y })
    sizes.set(boundary.id, {
      width: Math.max(420, maxX + padX),
      height: Math.max(260, maxY + padY),
    })
  }

  // Unused but keep lint happy for layerWidths in empty case
  void layerWidths
  return positions
}

/**
 * Compute AutoLayout patches for structure/whitebox nodes (parts + ports).
 * Does not route connections — caller should run redrawStructureConnections.
 */
export function autoLayoutStructure(nodes: Node[], edges: Edge[]): AutoLayoutResult {
  const links = collectLinks(edges)
  // Initial side guess from current ports for sizing
  const portPlacement = assignPortSidesAndOffsets(nodes, links)

  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of nodes) {
    if (node.type && node.type !== 'part') continue
    if (isBoundary(node)) continue
    const ports = portsOf(node).map((p) => {
      const placed = portPlacement.get(p.id)
      return {
        name: p.name,
        side: (placed?.side || p.side) as PortSide,
      }
    })
    const label = (node.data as PartNodeData)?.label || node.id
    sizes.set(node.id, sizePartForPorts(label, ports))
  }

  const positions = placeParts(nodes, links, sizes)
  const nodePatch: Record<string, Partial<VisualizationNode>> = {}

  for (const node of nodes) {
    if (node.type && node.type !== 'part') continue
    const sz = sizes.get(node.id)
    const pos = positions.get(node.id)
    if (sz && pos) {
      nodePatch[node.id] = {
        artifactId: node.id,
        x: pos.x,
        y: pos.y,
        width: sz.width,
        height: sz.height,
      }
    } else if (sz && isBoundary(node)) {
      nodePatch[node.id] = {
        artifactId: node.id,
        x: node.position.x,
        y: node.position.y,
        width: sz.width,
        height: sz.height,
      }
    }

    for (const port of portsOf(node)) {
      const placed = portPlacement.get(port.id)
      if (!placed) continue
      nodePatch[port.id] = {
        artifactId: port.id,
        side: placed.side,
        offset: placed.offset,
      }
    }
  }

  return { nodes: nodePatch }
}
