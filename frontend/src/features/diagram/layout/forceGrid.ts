/**
 * Force grid AutoLayout: shrink every part to what it needs and pack
 * siblings in a compact grid, bottom-up.
 *
 * - A leaf part gets the size its name and ports need (sizePartForPorts),
 *   whatever size it had before. Requirements, use cases and actors keep
 *   their size.
 * - A container gets the size of its children's grid plus room for its
 *   header and port names; a saved size is never a lower bound.
 * - Siblings are ordered as they are on screen (rows, then columns) and
 *   placed in a grid with one width per column and one height per row, so a
 *   second run gives the same result.
 * - Port sides follow the AutoLayout port mode; the frame of a whitebox
 *   keeps its own ports as the user placed them.
 */
import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  clampPortSideToMode,
  inferPortFlowRole,
  spacingToNodeNode,
  type AutoLayoutDirectives,
  type PortPlacementMode,
} from './autoLayoutOptions'
import { layoutBoundaryId, normalizeLayoutBoundary } from './layoutBoundary'
import { normalizeAutoLayoutCanvas } from './layoutNormalize'
import { isLayoutNode } from './layoutNodes'
import { PART_HEADER_PX, packBodyOffsets } from './portPlacement'
import { sizePartForPorts } from './structureAutoLayout'

const PAD = 24
const PORT_NAME_CHAR_W = 7.2
const TB_PORT_PAD = 16
const MIN_W = 140
const MIN_H = 72

type Size = { width: number; height: number }
type Patch = Record<string, Partial<VisualizationNode>>

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function labelOf(node: Node): string {
  return (node.data as PartNodeData | undefined)?.label || node.id
}

function readSize(n: Node): Size {
  const w = (typeof n.style?.width === 'number' && n.style.width) || n.width || MIN_W
  const h = (typeof n.style?.height === 'number' && n.style.height) || n.height || MIN_H
  return { width: Number(w) || MIN_W, height: Number(h) || MIN_H }
}

/** Parts are fitted; requirement, use case and actor boxes keep their size. */
function isFittedPart(n: Node): boolean {
  return !n.type || n.type === 'part'
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

function portLinks(edges: Edge[]): { sourcePort: string; targetPort: string }[] {
  const out: { sourcePort: string; targetPort: string }[] = []
  for (const e of edges) {
    const sourcePort = portIdFromHandle(e.sourceHandle)
    const targetPort = portIdFromHandle(e.targetHandle)
    if (sourcePort && targetPort) out.push({ sourcePort, targetPort })
  }
  return out
}

function nameWidth(ports: { name: string }[]): number {
  return Math.max(0, ...ports.map((p) => p.name.length * PORT_NAME_CHAR_W))
}

/** Room inside a container for its header and the names of its own ports. */
function containerInsets(ports: { name: string; side: PortSide }[]) {
  const on = (side: PortSide) => ports.filter((p) => p.side === side)
  return {
    left: PAD + nameWidth(on('left')),
    right: PAD + nameWidth(on('right')),
    top: PART_HEADER_PX + (on('top').length ? TB_PORT_PAD : 0),
    bottom: PAD + (on('bottom').length ? TB_PORT_PAD : 0),
  }
}

type Cell = { id: string; width: number; height: number }

/** Row-major grid, one width per column and one height per row. */
export function packGrid(
  cells: Cell[],
  gap: number,
  aspectRatio = 1,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const positions = new Map<string, { x: number; y: number }>()
  if (!cells.length) return { positions, width: 0, height: 0 }
  const n = cells.length
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * (aspectRatio || 1)))))
  const rows = Math.ceil(n / cols)
  const colW = Array.from({ length: cols }, () => 0)
  const rowH = Array.from({ length: rows }, () => 0)
  cells.forEach((c, i) => {
    colW[i % cols] = Math.max(colW[i % cols]!, c.width)
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)]!, c.height)
  })
  const colX: number[] = []
  let x = 0
  for (const w of colW) {
    colX.push(x)
    x += w + gap
  }
  const rowY: number[] = []
  let y = 0
  for (const h of rowH) {
    rowY.push(y)
    y += h + gap
  }
  cells.forEach((c, i) => {
    positions.set(c.id, { x: colX[i % cols]!, y: rowY[Math.floor(i / cols)]! })
  })
  return { positions, width: x - gap, height: y - gap }
}

function sidedPorts(
  node: Node,
  mode: PortPlacementMode,
  links: { sourcePort: string; targetPort: string }[],
  isFrame: boolean,
): PartPort[] {
  return portsOf(node).map((p) =>
    isFrame
      ? p
      : { ...p, side: clampPortSideToMode(mode, inferPortFlowRole(p, links), p.side) },
  )
}

function placePorts(ports: PartPort[], height: number, patch: Patch): void {
  for (const side of ['left', 'right', 'top', 'bottom'] as PortSide[]) {
    const group = ports
      .filter((p) => p.side === side)
      .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
    const offsets =
      side === 'left' || side === 'right'
        ? packBodyOffsets(group.length, height)
        : group.map((_, i) => 0.15 + ((i + 0.5) / group.length) * 0.7)
    group.forEach((p, i) => {
      patch[p.id] = { artifactId: p.id, side, offset: offsets[i] }
    })
  }
}

export function layoutForceGrid(
  inputNodes: Node[],
  edges: Edge[],
  directives: AutoLayoutDirectives,
): { nodes: Patch } {
  const nodes = normalizeLayoutBoundary(inputNodes)
  const placed = nodes.filter(isLayoutNode)
  const byId = new Map(placed.map((n) => [n.id, n]))
  const frameId = layoutBoundaryId(nodes)
  const mode = directives.portPlacement
  const links = portLinks(edges)
  const gap = Math.round(spacingToNodeNode(directives.spacing) / 4)
  const aspect = directives.aspectRatio || 1

  const childrenOf = new Map<string, Node[]>()
  const top: Node[] = []
  for (const n of placed) {
    if (n.parentId && byId.has(n.parentId)) {
      childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) || []), n])
    } else {
      top.push(n)
    }
  }
  // Keep the on-screen order: rows first, then columns.
  const screenOrder = (a: Node, b: Node) =>
    a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id)

  const patch: Patch = {}
  const sizes = new Map<string, Size>()

  const size = (node: Node): Size => {
    const hit = sizes.get(node.id)
    if (hit) return hit
    const isFrame = node.id === frameId
    const ports = sidedPorts(node, mode, links, isFrame)
    const kids = [...(childrenOf.get(node.id) || [])].sort(screenOrder)
    let result: Size
    if (!kids.length) {
      result = isFittedPart(node) ? sizePartForPorts(labelOf(node), ports) : readSize(node)
    } else {
      const grid = packGrid(
        kids.map((k) => ({ id: k.id, ...size(k) })),
        gap,
        aspect,
      )
      const inset = containerInsets(ports)
      for (const k of kids) {
        const p = grid.positions.get(k.id)!
        const s = sizes.get(k.id)!
        patch[k.id] = {
          ...patch[k.id],
          artifactId: k.id,
          x: inset.left + p.x,
          y: inset.top + p.y,
          width: s.width,
          height: s.height,
        }
      }
      const fitted = sizePartForPorts(labelOf(node), ports)
      result = {
        width: Math.max(inset.left + grid.width + inset.right, fitted.width),
        height: Math.max(inset.top + grid.height + inset.bottom, fitted.height),
      }
    }
    sizes.set(node.id, result)
    if (isFrame) {
      for (const p of ports) {
        patch[p.id] = { artifactId: p.id, side: p.side, offset: p.offset }
      }
    } else {
      placePorts(ports, result.height, patch)
    }
    return result
  }

  const sortedTop = [...top].sort(screenOrder)
  const topGrid = packGrid(
    sortedTop.map((n) => ({ id: n.id, ...size(n) })),
    gap,
    aspect,
  )
  for (const n of sortedTop) {
    const p = topGrid.positions.get(n.id)!
    const s = sizes.get(n.id)!
    patch[n.id] = {
      ...patch[n.id],
      artifactId: n.id,
      x: p.x,
      y: p.y,
      width: s.width,
      height: s.height,
    }
  }

  normalizeAutoLayoutCanvas(patch, nodes)
  return { nodes: patch }
}
