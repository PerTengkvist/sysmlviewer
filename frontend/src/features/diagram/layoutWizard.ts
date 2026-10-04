import type { LayoutRuleRow } from '../../api'
import { matchName } from './namePattern'

export type LayoutArtefact = {
  id: string
  name: string
  kind: string
  x: number
  y: number
  width: number
  height: number
}

export type LayoutConflict = {
  message: string
  rowIds: string[]
}

export const ABSOLUTE_PLACEMENTS = new Set([
  'bottom',
  'top',
  'rightmost',
  'leftmost',
])

export const PLACEMENT_OPTIONS = [
  'bottom',
  'below',
  'rightmost',
  'to the right of',
  'leftmost',
  'to the left of',
  'beside',
  'above',
  'top',
] as const

export function needsPeer(placement: string): boolean {
  return !ABSOLUTE_PLACEMENTS.has(placement)
}

export function matchArtefacts(
  artefacts: LayoutArtefact[],
  kind: string,
  namePattern: string,
): LayoutArtefact[] {
  const pattern = namePattern || '*'
  return artefacts.filter(
    (a) => a.kind === kind && matchName(pattern, a.name),
  )
}

type OrderEdge = { from: string; to: string; ruleId: string }

/** A → B means A must come before B (above / left of). */
function addOrder(
  edges: OrderEdge[],
  from: string,
  to: string,
  ruleId: string,
) {
  if (from === to) return
  edges.push({ from, to, ruleId })
}

function expandRulePairs(
  rule: LayoutRuleRow,
  artefacts: LayoutArtefact[],
): {
  subjects: LayoutArtefact[]
  peers: LayoutArtefact[]
  emptyPeer: boolean
} {
  const subjects = matchArtefacts(
    artefacts,
    rule.kind,
    rule.namePattern || '*',
  )
  if (!needsPeer(rule.placement)) {
    return { subjects, peers: [], emptyPeer: false }
  }
  const peerKind = rule.peerKind || ''
  const peerPattern = rule.peerNamePattern || '*'
  const peers = matchArtefacts(artefacts, peerKind, peerPattern)
  return { subjects, peers, emptyPeer: peers.length === 0 }
}

function collectVerticalEdges(
  rules: LayoutRuleRow[],
  artefacts: LayoutArtefact[],
): { edges: OrderEdge[]; emptyPeerRows: string[]; selfContra: string[] } {
  const edges: OrderEdge[] = []
  const emptyPeerRows: string[] = []
  const selfContra: string[] = []
  const allIds = artefacts.map((a) => a.id)

  for (const rule of rules) {
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length) continue
    if (needsPeer(rule.placement) && emptyPeer) {
      emptyPeerRows.push(rule.id)
      continue
    }

    if (rule.placement === 'top') {
      for (const s of subjects) {
        for (const other of allIds) {
          addOrder(edges, s.id, other, rule.id)
        }
      }
    } else if (rule.placement === 'bottom') {
      for (const s of subjects) {
        for (const other of allIds) {
          addOrder(edges, other, s.id, rule.id)
        }
      }
    } else if (rule.placement === 'above') {
      for (const s of subjects) {
        for (const p of peers) {
          if (s.id === p.id) continue
          addOrder(edges, s.id, p.id, rule.id)
        }
      }
      if (subjects.length >= 2 && peers.some((p) => subjects.some((s) => s.id === p.id))) {
        // overlapping sets can create cycles via one rule
        const ids = new Set(subjects.map((s) => s.id))
        for (const p of peers) {
          if (ids.has(p.id)) {
            // subject set intersects peer set
            let self = false
            for (const s of subjects) {
              for (const q of peers) {
                if (s.id !== q.id && ids.has(q.id)) {
                  self = true
                  break
                }
              }
            }
            if (self) selfContra.push(rule.id)
            break
          }
        }
      }
    } else if (rule.placement === 'below') {
      for (const s of subjects) {
        for (const p of peers) {
          if (s.id === p.id) continue
          addOrder(edges, p.id, s.id, rule.id)
        }
      }
      // Part * below Part * → every pair both ways → cycle
      const subjectIds = new Set(subjects.map((s) => s.id))
      const peerIds = peers.map((p) => p.id).filter((id) => subjectIds.has(id))
      if (peerIds.length >= 2 && subjectIds.size >= 2) {
        const overlap = peers.filter((p) => subjectIds.has(p.id))
        if (overlap.length >= 2) selfContra.push(rule.id)
      }
    }
  }
  return { edges, emptyPeerRows, selfContra: [...new Set(selfContra)] }
}

function collectHorizontalEdges(
  rules: LayoutRuleRow[],
  artefacts: LayoutArtefact[],
): { edges: OrderEdge[]; emptyPeerRows: string[]; selfContra: string[] } {
  const edges: OrderEdge[] = []
  const emptyPeerRows: string[] = []
  const selfContra: string[] = []
  const allIds = artefacts.map((a) => a.id)

  for (const rule of rules) {
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length) continue
    if (needsPeer(rule.placement) && emptyPeer) {
      emptyPeerRows.push(rule.id)
      continue
    }

    if (rule.placement === 'leftmost') {
      for (const s of subjects) {
        for (const other of allIds) {
          addOrder(edges, s.id, other, rule.id)
        }
      }
    } else if (rule.placement === 'rightmost') {
      for (const s of subjects) {
        for (const other of allIds) {
          addOrder(edges, other, s.id, rule.id)
        }
      }
    } else if (rule.placement === 'to the left of') {
      for (const s of subjects) {
        for (const p of peers) {
          if (s.id === p.id) continue
          addOrder(edges, s.id, p.id, rule.id)
        }
      }
      const subjectIds = new Set(subjects.map((s) => s.id))
      if (peers.filter((p) => subjectIds.has(p.id)).length >= 2) {
        selfContra.push(rule.id)
      }
    } else if (rule.placement === 'to the right of') {
      for (const s of subjects) {
        for (const p of peers) {
          if (s.id === p.id) continue
          addOrder(edges, p.id, s.id, rule.id)
        }
      }
      const subjectIds = new Set(subjects.map((s) => s.id))
      if (peers.filter((p) => subjectIds.has(p.id)).length >= 2) {
        selfContra.push(rule.id)
      }
    }
  }
  return { edges, emptyPeerRows, selfContra: [...new Set(selfContra)] }
}

/** Find nodes/edges involved in cycles; return rule ids on those edges. */
function cycleRuleIds(edges: OrderEdge[], nodeIds: string[]): string[] {
  const adj = new Map<string, { to: string; ruleId: string }[]>()
  for (const id of nodeIds) adj.set(id, [])
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push({ to: e.to, ruleId: e.ruleId })
  }

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const id of adj.keys()) color.set(id, WHITE)
  const bad = new Set<string>()

  type Frame = { id: string; i: number; edgeRule?: string }
  for (const start of adj.keys()) {
    if (color.get(start) !== WHITE) continue
    const stack: Frame[] = [{ id: start, i: 0 }]
    const path: string[] = []
    const pathRules: string[] = []
    color.set(start, GRAY)

    while (stack.length) {
      const frame = stack[stack.length - 1]
      const outs = adj.get(frame.id) || []
      if (frame.i === 0) path.push(frame.id)
      if (frame.i < outs.length) {
        const { to, ruleId } = outs[frame.i++]
        const c = color.get(to) ?? WHITE
        if (c === GRAY) {
          // back edge — cycle
          const idx = path.indexOf(to)
          for (let k = idx; k < path.length; k++) {
            if (k < pathRules.length) bad.add(pathRules[k])
          }
          bad.add(ruleId)
          // also mark edges along the cycle from pathRules after idx
          for (let k = idx; k < pathRules.length; k++) bad.add(pathRules[k])
        } else if (c === WHITE) {
          color.set(to, GRAY)
          pathRules.push(ruleId)
          stack.push({ id: to, i: 0, edgeRule: ruleId })
        }
      } else {
        color.set(frame.id, BLACK)
        path.pop()
        if (frame.edgeRule != null) pathRules.pop()
        stack.pop()
      }
    }
  }
  return [...bad]
}

/** Direct vertical order between two ids from edges. */
function hasDirectOrder(
  edges: OrderEdge[],
  a: string,
  b: string,
): OrderEdge | undefined {
  return edges.find(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  )
}

function findBesideConflicts(
  rules: LayoutRuleRow[],
  artefacts: LayoutArtefact[],
  verticalEdges: OrderEdge[],
): string[] {
  const bad = new Set<string>()
  for (const rule of rules) {
    if (rule.placement !== 'beside') continue
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length) continue
    if (emptyPeer) {
      bad.add(rule.id)
      continue
    }
    for (const s of subjects) {
      for (const p of peers) {
        if (s.id === p.id) continue
        const edge = hasDirectOrder(verticalEdges, s.id, p.id)
        if (edge) {
          bad.add(rule.id)
          bad.add(edge.ruleId)
        }
        // also: top/bottom on subject conflicts with beside unless peer shares band —
        // top/bottom already create vertical edges to peer, caught above.
      }
    }
  }
  return [...bad]
}

export function findLayoutConflicts(
  rules: LayoutRuleRow[],
  artefacts: LayoutArtefact[],
): LayoutConflict {
  const nodeIds = artefacts.map((a) => a.id)
  const vert = collectVerticalEdges(rules, artefacts)
  const horiz = collectHorizontalEdges(rules, artefacts)

  const bad = new Set<string>()
  for (const id of vert.emptyPeerRows) bad.add(id)
  for (const id of horiz.emptyPeerRows) bad.add(id)
  for (const id of vert.selfContra) bad.add(id)
  for (const id of horiz.selfContra) bad.add(id)

  for (const id of cycleRuleIds(vert.edges, nodeIds)) bad.add(id)
  for (const id of cycleRuleIds(horiz.edges, nodeIds)) bad.add(id)
  for (const id of findBesideConflicts(rules, artefacts, vert.edges)) {
    bad.add(id)
  }

  // empty peer for beside is also in emptyPeer via vertical? beside isn't in
  // vertical collector — handle here
  for (const rule of rules) {
    if (!needsPeer(rule.placement)) continue
    const { subjects, emptyPeer } = expandRulePairs(rule, artefacts)
    if (subjects.length && emptyPeer) bad.add(rule.id)
  }

  if (!bad.size) return { message: '', rowIds: [] }

  const rowIds = [...bad].sort()
  const emptyPeer = rules.some(
    (r) =>
      bad.has(r.id) &&
      needsPeer(r.placement) &&
      expandRulePairs(r, artefacts).emptyPeer &&
      expandRulePairs(r, artefacts).subjects.length > 0,
  )
  const message = emptyPeer
    ? `Peer pattern matches nothing on row(s): ${rowIds.join(', ')}`
    : `Conflicting layout rules: ${rowIds.join(', ')}`
  return { message, rowIds }
}

function marginBetween(a: number, b: number): number {
  return Math.max(a, b)
}

function longestPathBands(
  nodeIds: string[],
  edges: OrderEdge[],
): Map<string, number> {
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  const seen = new Set<string>()
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue
    const key = `${e.from}->${e.to}`
    if (seen.has(key)) continue
    seen.add(key)
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1)
  }

  const band = new Map<string, number>()
  for (const id of nodeIds) band.set(id, 0)
  const queue = nodeIds.filter((id) => (indeg.get(id) || 0) === 0).sort()
  const order: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    order.push(u)
    for (const v of adj.get(u) || []) {
      band.set(v, Math.max(band.get(v) || 0, (band.get(u) || 0) + 1))
      const d = (indeg.get(v) || 0) - 1
      indeg.set(v, d)
      if (d === 0) {
        queue.push(v)
        queue.sort()
      }
    }
  }
  return band
}

/**
 * Assign positions from layout rules. Caller must verify
 * findLayoutConflicts(...).rowIds is empty first.
 */
export function solveLayoutRules(
  artefacts: LayoutArtefact[],
  rules: LayoutRuleRow[],
): Record<string, { x: number; y: number }> {
  const byId = new Map(artefacts.map((a) => [a.id, a]))
  const positions: Record<string, { x: number; y: number }> = {}
  for (const a of artefacts) {
    positions[a.id] = { x: a.x, y: a.y }
  }

  const involved = new Set<string>()
  for (const rule of rules) {
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length) continue
    if (needsPeer(rule.placement) && emptyPeer) continue
    for (const s of subjects) involved.add(s.id)
    if (rule.placement === 'top' || rule.placement === 'bottom') {
      for (const a of artefacts) involved.add(a.id)
    } else if (rule.placement === 'leftmost' || rule.placement === 'rightmost') {
      for (const a of artefacts) involved.add(a.id)
    } else {
      for (const p of peers) involved.add(p.id)
    }
  }

  // beside-only subjects that have no vertical order still need placement
  for (const rule of rules) {
    if (rule.placement !== 'beside') continue
    const { subjects, peers } = expandRulePairs(rule, artefacts)
    for (const s of subjects) involved.add(s.id)
    for (const p of peers) involved.add(p.id)
  }

  if (!involved.size) return positions

  const nodeIds = [...involved]
  const vert = collectVerticalEdges(rules, artefacts).edges
  const horiz = collectHorizontalEdges(rules, artefacts).edges

  const vBand = longestPathBands(nodeIds, vert)
  const hBand = longestPathBands(nodeIds, horiz)

  // Group by (vBand, hBand) for packing; then place bands
  const maxV = Math.max(0, ...[...vBand.values()])
  const maxH = Math.max(0, ...[...hBand.values()])

  // Compute size of each vertical band and horizontal band
  const vMembers: string[][] = Array.from({ length: maxV + 1 }, () => [])
  for (const id of nodeIds) {
    vMembers[vBand.get(id) || 0].push(id)
  }
  for (const band of vMembers) band.sort((a, b) => {
    const na = byId.get(a)!.name
    const nb = byId.get(b)!.name
    return na.localeCompare(nb) || a.localeCompare(b)
  })

  const hMembers: string[][] = Array.from({ length: maxH + 1 }, () => [])
  for (const id of nodeIds) {
    hMembers[hBand.get(id) || 0].push(id)
  }

  // Y positions by vertical band (top → bottom)
  const bandY: number[] = []
  let yCursor = Math.min(...nodeIds.map((id) => byId.get(id)!.y))
  if (!Number.isFinite(yCursor)) yCursor = 48
  for (let b = 0; b <= maxV; b++) {
    bandY[b] = yCursor
    const members = vMembers[b]
    if (!members.length) continue
    const maxHgt = Math.max(...members.map((id) => byId.get(id)!.height))
    const nextMax =
      b < maxV && vMembers[b + 1].length
        ? Math.max(...vMembers[b + 1].map((id) => byId.get(id)!.height))
        : maxHgt
    yCursor += maxHgt + marginBetween(maxHgt, nextMax)
  }

  // X positions by horizontal band (left → right)
  const bandX: number[] = []
  let xCursor = Math.min(...nodeIds.map((id) => byId.get(id)!.x))
  if (!Number.isFinite(xCursor)) xCursor = 48
  for (let b = 0; b <= maxH; b++) {
    bandX[b] = xCursor
    const members = hMembers[b]
    if (!members.length) continue
    const maxW = Math.max(...members.map((id) => byId.get(id)!.width))
    const nextMax =
      b < maxH && hMembers[b + 1].length
        ? Math.max(...hMembers[b + 1].map((id) => byId.get(id)!.width))
        : maxW
    xCursor += maxW + marginBetween(maxW, nextMax)
  }

  // Within a vertical band, pack by horizontal band; within same cell, stack by name
  const cellCount = new Map<string, number>()
  for (const id of nodeIds) {
    const vb = vBand.get(id) || 0
    const hb = hBand.get(id) || 0
    const key = `${vb}:${hb}`
    const idx = cellCount.get(key) || 0
    cellCount.set(key, idx + 1)
    const a = byId.get(id)!
    const gap = marginBetween(a.width, a.width)
    positions[id] = {
      x: bandX[hb] + idx * (a.width + gap),
      y: bandY[vb],
    }
  }

  // Apply beside: same vertical band as peer group, to the right if no h-order
  for (const rule of rules) {
    if (rule.placement !== 'beside') continue
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length || emptyPeer) continue
    for (const s of subjects) {
      const peerList = peers.filter((p) => p.id !== s.id)
      if (!peerList.length) continue
      const peerRight = Math.max(
        ...peerList.map((p) => positions[p.id].x + p.width),
      )
      const peerTop = Math.min(...peerList.map((p) => positions[p.id].y))
      const peerBottom = Math.max(
        ...peerList.map((p) => positions[p.id].y + p.height),
      )
      const peerMidY = (peerTop + peerBottom) / 2
      const hasH =
        horiz.some((e) => e.from === s.id || e.to === s.id)
      if (!hasH) {
        positions[s.id] = {
          x: peerRight + marginBetween(s.width, peerList[0].width),
          y: peerMidY - s.height / 2,
        }
      } else {
        // keep x from band, align y to peer mid
        positions[s.id] = {
          x: positions[s.id].x,
          y: peerMidY - s.height / 2,
        }
      }
    }
  }

  // Refine relative edges: ensure subject is beyond peer group extremity
  for (const rule of rules) {
    const { subjects, peers, emptyPeer } = expandRulePairs(rule, artefacts)
    if (!subjects.length) continue
    if (needsPeer(rule.placement) && emptyPeer) continue

    if (rule.placement === 'below') {
      for (const s of subjects) {
        const peerList = peers.filter((p) => p.id !== s.id)
        if (!peerList.length) continue
        const bottom = Math.max(
          ...peerList.map((p) => positions[p.id].y + p.height),
        )
        const gap = marginBetween(
          s.height,
          Math.max(...peerList.map((p) => p.height)),
        )
        const y = bottom + gap
        if (positions[s.id].y < y) positions[s.id].y = y
      }
    } else if (rule.placement === 'above') {
      for (const s of subjects) {
        const peerList = peers.filter((p) => p.id !== s.id)
        if (!peerList.length) continue
        const top = Math.min(...peerList.map((p) => positions[p.id].y))
        const gap = marginBetween(
          s.height,
          Math.max(...peerList.map((p) => p.height)),
        )
        const y = top - gap - s.height
        if (positions[s.id].y > y) positions[s.id].y = y
      }
    } else if (rule.placement === 'to the right of') {
      for (const s of subjects) {
        const peerList = peers.filter((p) => p.id !== s.id)
        if (!peerList.length) continue
        const right = Math.max(
          ...peerList.map((p) => positions[p.id].x + p.width),
        )
        const gap = marginBetween(
          s.width,
          Math.max(...peerList.map((p) => p.width)),
        )
        const x = right + gap
        if (positions[s.id].x < x) positions[s.id].x = x
      }
    } else if (rule.placement === 'to the left of') {
      for (const s of subjects) {
        const peerList = peers.filter((p) => p.id !== s.id)
        if (!peerList.length) continue
        const left = Math.min(...peerList.map((p) => positions[p.id].x))
        const gap = marginBetween(
          s.width,
          Math.max(...peerList.map((p) => p.width)),
        )
        const x = left - gap - s.width
        if (positions[s.id].x > x) positions[s.id].x = x
      }
    }
  }

  return positions
}
