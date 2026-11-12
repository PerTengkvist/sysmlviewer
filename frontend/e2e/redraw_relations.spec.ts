import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * GeneralView "Redraw: Relations": every relation is redrawn as a straight
 * line that leaves each node where the centre-to-centre line crosses its
 * border. Nodes stay put, the result is saved per view and can be undone.
 */

type Box = { x: number; y: number; width: number; height: number }
type Pt = { x: number; y: number }
type Geometry = {
  boxes: Record<string, Box>
  edges: Record<string, { d: string; start: Pt; end: Pt }>
}

const REQ_VIEW = 'Requirements::RequirementsGraphView'
const LOGICAL_VIEW = 'LogicalArchitecture::CarLogicalView'
const RELATION_KINDS = new Set([
  'dependency',
  'satisfy',
  'include',
  'allocation',
  'specialization',
  'subsetting',
  'redefinition',
])

let projectId = ''

const redrawButton = (page: Page) =>
  page.getByRole('button', { name: 'Redraw: Relations', exact: true })

/**
 * Node boxes and edge path ends, both in flow coordinates. Node boxes come
 * from the screen (so nested nodes are absolute) mapped back through the
 * viewport transform.
 */
async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!
    const m = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
    const origin = viewport.parentElement!.getBoundingClientRect()
    const k = m.a
    const toFlow = (sx: number, sy: number) => ({
      x: (sx - origin.left - m.e) / k,
      y: (sy - origin.top - m.f) / k,
    })
    const boxes: Record<string, Box> = {}
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      const id = el.dataset.id
      if (!id) continue
      const r = el.getBoundingClientRect()
      const p = toFlow(r.left, r.top)
      boxes[id] = { x: p.x, y: p.y, width: r.width / k, height: r.height / k }
    }
    const edges: Record<string, { d: string; start: Pt; end: Pt }> = {}
    for (const g of document.querySelectorAll<SVGGElement>('.react-flow__edge')) {
      const id = g.getAttribute('data-id')
      const d = g.querySelector('path.react-flow__edge-path')?.getAttribute('d')
      if (!id || !d) continue
      const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number)
      if (nums.length < 4) continue
      edges[id] = {
        d,
        start: { x: nums[0]!, y: nums[1]! },
        end: { x: nums[nums.length - 2]!, y: nums[nums.length - 1]! },
      }
    }
    return { boxes, edges }
  })
}

/** Where the line from the centre of `box` toward `peer`'s centre leaves `box`. */
function exitPoint(box: Box, peer: Box): Pt {
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const p = { x: peer.x + peer.width / 2, y: peer.y + peer.height / 2 }
  const dx = p.x - c.x
  const dy = p.y - c.y
  const tx = Math.abs(dx) > 1e-9 ? box.width / 2 / Math.abs(dx) : Infinity
  const ty = Math.abs(dy) > 1e-9 ? box.height / 2 / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  return { x: c.x + dx * t, y: c.y + dy * t }
}

/**
 * The same path, up to 0.05 px per number. Handles are measured at the zoom
 * the diagram had when it was drawn, so a redraw at another zoom differs by
 * float noise (around 1e-4 px), not by geometry.
 */
const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g
function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return a === b
  if (a.replace(NUM, '#') !== b.replace(NUM, '#')) return false
  const na = a.match(NUM)!.map(Number)
  const nb = b.match(NUM)!.map(Number)
  return na.every((n, i) => Math.abs(n - nb[i]!) <= 0.05)
}

const near = (a: Pt, b: Pt, tol = 8) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

type Ends = Record<string, { source: string; target: string }>

/** Relation edges of a view with their end elements, read from the API. */
async function relationEndpoints(page: Page, viewId: string): Promise<Ends> {
  const res = await page.request.get(
    `/api/projects/${projectId}/views/${encodeURIComponent(viewId)}`,
  )
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as {
    semantic: Record<string, { kind: string; sourceId?: string | null; targetId?: string | null }>
  }
  const out: Ends = {}
  for (const [id, el] of Object.entries(body.semantic)) {
    if (!RELATION_KINDS.has(el.kind) || !el.sourceId || !el.targetId) continue
    out[id] = { source: el.sourceId, target: el.targetId }
  }
  return out
}

/** Relation ids whose path does not start and end at the centre-line exits. */
function misattached(geo: Geometry, ends: Ends): string[] {
  const bad: string[] = []
  for (const [id, { source, target }] of Object.entries(ends)) {
    const e = geo.edges[id]
    const s = geo.boxes[source]
    const t = geo.boxes[target]
    if (!e || !s || !t) continue
    if (!near(e.start, exitPoint(s, t)) || !near(e.end, exitPoint(t, s))) bad.push(id)
  }
  return bad
}

test.beforeEach(async ({ page }) => {
  projectId = await openProject(page, exampleProjectFile('electric_car'))
})

test('redraws relations to the facing borders, undoes, and survives a reload', async ({
  page,
}) => {
  await openView(page, REQ_VIEW)
  await fitView(page)
  const all = await relationEndpoints(page, REQ_VIEW)
  const before = await geometry(page)
  const ends: Ends = Object.fromEntries(
    Object.entries(all).filter(
      ([id, e]) => before.edges[id] && before.boxes[e.source] && before.boxes[e.target],
    ),
  )
  expect(Object.keys(ends).length).toBeGreaterThan(5)
  // The saved layout has hand-placed attachments that do not face each other.
  expect(misattached(before, ends).length).toBeGreaterThan(0)

  await expect(redrawButton(page)).toBeEnabled()
  await redrawButton(page).click()
  await page.waitForTimeout(500)

  const after = await geometry(page)
  expect(misattached(after, ends)).toEqual([])
  for (const [id, box] of Object.entries(before.boxes)) {
    expect(Math.abs(after.boxes[id]!.x - box.x), id).toBeLessThan(0.5)
    expect(Math.abs(after.boxes[id]!.y - box.y), id).toBeLessThan(0.5)
  }

  // Undo puts the old attachments back; redo brings the redraw again.
  const changed = Object.keys(ends).filter(
    (id) => after.edges[id]?.d !== before.edges[id]?.d,
  )
  expect(changed.length).toBeGreaterThan(0)
  await page.getByTitle('Undo (Ctrl/Cmd+Z)').click()
  await page.waitForTimeout(500)
  const undone = await geometry(page)
  for (const id of changed) {
    const [u, b] = [undone.edges[id]?.d, before.edges[id]?.d]
    expect(samePath(u, b), `${id}: ${u} vs ${b}`).toBe(true)
  }
  await page.getByTitle('Redo (Ctrl/Cmd+Y)').click()
  await page.waitForTimeout(500)
  expect(misattached(await geometry(page), ends)).toEqual([])

  // Saved per view: the same paths come back after a reload.
  await page.waitForTimeout(800)
  await openView(page, REQ_VIEW)
  await fitView(page)
  const reloaded = await geometry(page)
  for (const id of Object.keys(ends)) {
    const [r, a] = [reloaded.edges[id]?.d, after.edges[id]?.d]
    expect(samePath(r, a), `${id}: ${r} vs ${a}`).toBe(true)
  }
})

test('a whitebox GeneralView has the button and keeps its connections', async ({ page }) => {
  await openView(page, LOGICAL_VIEW)
  await fitView(page)
  await expect(redrawButton(page)).toBeVisible()
  const relations = await relationEndpoints(page, LOGICAL_VIEW)
  const before = await geometry(page)
  if (await redrawButton(page).isEnabled()) {
    await redrawButton(page).click()
    await page.waitForTimeout(500)
  }
  const after = await geometry(page)
  for (const [id, e] of Object.entries(before.edges)) {
    if (id in relations) continue
    expect(after.edges[id]?.d, id).toBe(e.d)
  }
})
