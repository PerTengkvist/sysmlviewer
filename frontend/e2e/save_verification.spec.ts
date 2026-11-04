import { expect, test, type Page, type Response } from '@playwright/test'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

type SaveResult = {
  status: string
  mismatches: {
    element: string
    id: string
    name: string
    field: string
    canvas: unknown
    saved: unknown
    source: string
  }[]
  events: { code: string; message: string }[]
}

type EventRecord = { seq: number; level: string; code: string; message: string }

const NESTED_VIEW = 'HierarchicalPartsPkg::NestedPortsView'
const SHIPPED_NESTED_VIEW = path.resolve('../examples/diagrams/views/NestedPortsView.json')

async function clickSave(page: Page): Promise<SaveResult> {
  const response = page.waitForResponse(
    (r) => r.url().includes('/save-snapshot') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  return (await (await response).json()) as SaveResult
}

type Geometry = {
  nodes: Record<string, string>
  edges: Record<string, string>
}

/** Node transforms and edge paths are flow coordinates, independent of zoom. */
async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const nodes: Record<string, string> = {}
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      nodes[el.dataset.id ?? ''] = `${el.style.transform} ${el.offsetWidth}x${el.offsetHeight}`
    }
    const edges: Record<string, string> = {}
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__edge')) {
      const id = el.getAttribute('data-id') ?? ''
      edges[id] = el.querySelector('path')?.getAttribute('d') ?? ''
    }
    return { nodes, edges }
  })
}

async function events(page: Page, projectId: string): Promise<EventRecord[]> {
  const res = await page.request.get(`/api/projects/${projectId}/events`)
  return ((await res.json()) as { events: EventRecord[] }).events
}

function nodeSelector(id: string): string {
  return `.react-flow__node[data-id="${id}"]`
}

/** Reloads and returns the automatic check's answer, which is logged only once. */
async function reloadAndReadRestoreCheck(page: Page): Promise<SaveResult | null> {
  let result: SaveResult | null = null
  const onResponse = async (response: Response) => {
    if (response.url().includes('/compare')) {
      result = (await response.json()) as SaveResult
    }
  }
  page.on('response', onResponse)
  await page.reload()
  await page.waitForTimeout(1200)
  page.off('response', onResponse)
  return result
}

/** Leaf parts on screen that have a connection or binding on one of their ports. */
async function connectedParts(page: Page, projectId: string): Promise<string[]> {
  const res = await page.request.get(
    `/api/projects/${projectId}/views/${encodeURIComponent(NESTED_VIEW)}?levels=3`,
  )
  const view = (await res.json()) as {
    semantic: Record<
      string,
      { kind: string; sourceId?: string; targetId?: string; parentId?: string }
    >
  }
  const owners = new Set<string>()
  for (const element of Object.values(view.semantic)) {
    if (element.kind !== 'connection' && element.kind !== 'binding') continue
    for (const end of [element.sourceId, element.targetId]) {
      const parent = end ? view.semantic[end]?.parentId : undefined
      if (parent) owners.add(parent)
    }
  }
  const onScreen = await page.evaluate(() => {
    const parents = new Set<string>()
    const nodes = [...document.querySelectorAll<HTMLElement>('.react-flow__node-part')]
    for (const node of nodes) {
      if (node.querySelector('.react-flow__node')) parents.add(node.dataset.id ?? '')
    }
    return nodes.map((node) => node.dataset.id ?? '').filter((id) => !parents.has(id))
  })
  const containers = new Set(
    onScreen.filter((id) => onScreen.some((other) => other.startsWith(`${id}::`))),
  )
  const found = onScreen.filter((id) => owners.has(id) && !containers.has(id))
  expect(found.length, 'connected leaf parts').toBeGreaterThan(1)
  return found
}

/** A part on screen with parts nested in it, below the diagram's own frame. */
async function containerPart(page: Page): Promise<string> {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-part')].map(
      (node) => node.dataset.id ?? '',
    ),
  )
  const containers = ids
    .filter((id) => ids.some((other) => other.startsWith(`${id}::`)))
    .sort((a, b) => b.split('::').length - a.split('::').length)
  expect(containers.length, 'parts with nested parts').toBeGreaterThan(0)
  return containers[0]
}

async function dragNode(page: Page, id: string, dx: number, dy: number) {
  const node = page.locator(nodeSelector(id))
  const box = await node.boundingBox()
  expect(box, `node ${id} is on screen`).toBeTruthy()
  const x = box!.x + box!.width / 2
  const y = box!.y + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 })
  await page.mouse.move(x + dx, y + dy, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}

async function expectUnchangedAfterReload(page: Page, before: Geometry) {
  await page.reload()
  await page.locator('.react-flow__node').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(800)
  const after = await readGeometry(page)
  expect(after.nodes).toEqual(before.nodes)
  expect(routesThatDiffer(before.edges, after.edges)).toEqual([])
}

const ROUTE_TOLERANCE_PX = 0.5

function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

/** Same tolerance as the backend check, as a reload re-attaches route ends. */
function routesThatDiffer(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return Object.keys(before).filter((id) => {
    const a = pathNumbers(before[id])
    const b = pathNumbers(after[id] ?? '')
    return (
      a.length !== b.length ||
      a.some((value, index) => Math.abs(value - b[index]) > ROUTE_TOLERANCE_PX)
    )
  }).map((id) => `${id}\n  before ${before[id]}\n  after  ${after[id]}`)
}

test.describe('save verification', () => {
  test('saving any example view raises no false alarm', async ({ page }) => {
    test.setTimeout(600_000)
    const failures: Record<string, SaveResult['mismatches']> = {}
    let confirmed = 0
    for (const example of ['diagrams', 'electric_car'] as const) {
      const projectId = await openProject(page, exampleProjectFile(example))
      const res = await page.request.get(`/api/projects/${projectId}`)
      const project = (await res.json()) as {
        views: { id: string; diagramMode?: string }[]
      }
      for (const view of project.views) {
        await page.goto(`/?view=${encodeURIComponent(view.id)}`)
        await page.waitForTimeout(900)
        if (!(await page.locator('.react-flow__node').count())) continue
        const result = await clickSave(page)
        if (result.status === 'mismatch') failures[view.id] = result.mismatches.slice(0, 6)
        else if (result.status === 'confirmed') confirmed += 1
      }
    }
    expect(failures).toEqual({})
    expect(confirmed).toBeGreaterThan(5)
  })

  test('a saved view opens exactly as saved', async ({ page }) => {
    test.setTimeout(600_000)
    const failures: Record<string, string[]> = {}
    let checked = 0
    for (const example of ['diagrams', 'electric_car'] as const) {
      const projectId = await openProject(page, exampleProjectFile(example))
      const res = await page.request.get(`/api/projects/${projectId}`)
      const project = (await res.json()) as { views: { id: string }[] }
      for (const view of project.views) {
        await page.goto(`/?view=${encodeURIComponent(view.id)}`)
        await page.waitForTimeout(900)
        if (!(await page.locator('.react-flow__node').count())) continue
        await clickSave(page)
        const result = await reloadAndReadRestoreCheck(page)
        if (result?.status === 'mismatch') {
          failures[view.id] = result.mismatches
            .slice(0, 6)
            .map((m) => `${m.element} ${m.name}: ${m.field} ${m.canvas} / ${m.saved}`)
        }
        if (result) checked += 1
      }
    }
    expect(failures).toEqual({})
    expect(checked).toBeGreaterThan(5)
  })

  test.describe('gestures survive a reload without Save', () => {
    let projectId = ''

    // The tests share a workspace. Each starts from the shipped layout so that
    // no result depends on where an earlier test left a part.
    test.beforeEach(async ({ page }) => {
      const file = path.join(
        path.dirname(exampleProjectFile('diagrams')),
        'views',
        'NestedPortsView.json',
      )
      writeFileSync(file, readFileSync(SHIPPED_NESTED_VIEW, 'utf8'))
      projectId = await openProject(page, exampleProjectFile('diagrams'))
      await openView(page, NESTED_VIEW)
    })

    test('dragging a connected part', async ({ page }) => {
      const [id] = await connectedParts(page, projectId)
      await dragNode(page, id, 24, 18)
      await page.waitForTimeout(800)

      await expectUnchangedAfterReload(page, await readGeometry(page))
    })

    test('dragging several selected parts', async ({ page }) => {
      const [first, second] = await connectedParts(page, projectId)
      await page.locator(nodeSelector(first)).click({ position: { x: 20, y: 10 } })
      await page
        .locator(nodeSelector(second))
        .click({ position: { x: 20, y: 10 }, modifiers: ['Shift'] })
      await expect(page.locator(`${nodeSelector(second)}.selected`)).toBeVisible()
      const before = await readGeometry(page)
      await dragNode(page, first, 18, 12)
      await page.waitForTimeout(800)
      const moved = await readGeometry(page)
      expect(moved.nodes[first]).not.toEqual(before.nodes[first])
      expect(moved.nodes[second]).not.toEqual(before.nodes[second])

      await expectUnchangedAfterReload(page, moved)
    })

    test('resizing from the top left corner', async ({ page }) => {
      const [id] = await connectedParts(page, projectId)
      const node = page.locator(nodeSelector(id))
      await node.click({ position: { x: 20, y: 10 } })
      const handle = node.locator('.react-flow__resize-control.top.left').first()
      const box = await handle.boundingBox()
      expect(box, 'resize handle is on screen').toBeTruthy()
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.down()
      await page.mouse.move(box!.x - 46, box!.y - 38, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(800)

      await expectUnchangedAfterReload(page, await readGeometry(page))
    })

    test('moving a part with the arrow keys', async ({ page }) => {
      const [id] = await connectedParts(page, projectId)
      const before = await readGeometry(page)
      await page.locator(nodeSelector(id)).click({ position: { x: 20, y: 10 } })
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(800)
      const moved = await readGeometry(page)
      expect(moved.nodes[id]).not.toEqual(before.nodes[id])

      await expectUnchangedAfterReload(page, moved)
    })

    test('dragging a part with nested parts', async ({ page }) => {
      const id = await containerPart(page)
      await dragNode(page, id, 20, 16)
      await page.waitForTimeout(800)

      await expectUnchangedAfterReload(page, await readGeometry(page))
    })

    test('Save confirms a drag and the view reopens unchanged', async ({ page }) => {
      const [id] = await connectedParts(page, projectId)
      await dragNode(page, id, 24, 18)
      await page.waitForTimeout(800)

      const result = await clickSave(page)
      const before = await readGeometry(page)

      expect(result.status).toBe('confirmed')
      expect(result.events.map((e) => e.code)).toContain('save.successful')
      await expectUnchangedAfterReload(page, before)
    })
  })

  test('the restore check reads the route on screen, not the saved one', async ({
    page,
  }) => {
    const root = path.dirname(exampleProjectFile('diagrams'))
    const file = path.join(root, 'views', 'NestedPortsView.json')
    const original = readFileSync(file, 'utf8')
    await openProject(page, exampleProjectFile('diagrams'))
    await openView(page, NESTED_VIEW)
    const shown = Object.keys((await readGeometry(page)).edges)
    const doc = JSON.parse(original) as {
      edges: Record<string, { waypoints?: { x: number; y: number }[] }>
    }
    const id = shown.find((edge) => (doc.edges[edge]?.waypoints?.length ?? 0) > 1)
    expect(id, 'a drawn connection with a saved route').toBeTruthy()
    // No longer meets its port, so the connection re-attaches it locally.
    const first = doc.edges[id!].waypoints![0]
    first.x += 300
    first.y += 300
    writeFileSync(file, JSON.stringify(doc))
    try {
      const result = await reloadAndReadRestoreCheck(page)

      expect(result?.status).toBe('mismatch')
      expect(result?.mismatches.map((m) => m.id)).toContain(id)
    } finally {
      writeFileSync(file, original)
    }
  })

  test('a read-only view file is reported in the drawer', async ({ page }) => {
    const root = path.dirname(exampleProjectFile('diagrams'))
    const file = path.join(root, 'views', 'NestedPortsView.json')
    await openProject(page, exampleProjectFile('diagrams'))
    await openView(page, NESTED_VIEW)
    chmodSync(file, 0o444)
    try {
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      const drawer = page.getByRole('region', { name: 'Event log' })
      await expect(drawer).toContainText('Cannot write NestedPortsView.json')
      await expect(page.getByRole('alert')).toBeVisible()
    } finally {
      chmodSync(file, 0o644)
    }
  })

  test('the drawer sits under the canvas and shrinks it', async ({ page }) => {
    await openProject(page, exampleProjectFile('diagrams'))
    await openView(page, NESTED_VIEW)
    const flow = page.locator('.react-flow').first()
    const fullHeight = (await flow.boundingBox())!.height

    await page.getByRole('button', { name: /^Events/ }).click()
    const drawer = page.getByRole('region', { name: 'Event log' })
    await drawer.waitFor()
    await page.waitForTimeout(300)

    const canvas = (await flow.boundingBox())!
    const box = (await drawer.boundingBox())!
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(box.y + 1)
    expect(canvas.height).toBeLessThan(fullHeight)

    await page.getByRole('button', { name: 'Close events' }).click()
    await expect(drawer).toBeHidden()
    await expect.poll(async () => (await flow.boundingBox())!.height).toBe(fullHeight)
  })

  test('the drawer shows what the log file holds', async ({ page }) => {
    const root = path.dirname(exampleProjectFile('diagrams'))
    await openProject(page, exampleProjectFile('diagrams'))
    await openView(page, NESTED_VIEW)
    await clickSave(page)
    await page.getByRole('button', { name: /^Events/ }).click()
    await page.getByRole('region', { name: 'Event log' }).waitFor()
    await page.waitForTimeout(500)

    const shown = await page.locator('.events-message').allTextContents()
    const logged = readFileSync(path.join(root, '.sysmlviewer', 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as EventRecord).message)
      .reverse()

    expect(shown).toEqual(logged.slice(0, shown.length))
    expect(shown.some((m) => m.startsWith('Save successful'))).toBe(true)
    expect(shown.some((m) => m.startsWith('Parts positions confirmed'))).toBe(true)
    expect(shown.some((m) => m.startsWith('Connections and bindings confirmed'))).toBe(true)
    expect(shown.some((m) => m.startsWith('File permissions OK'))).toBe(true)
  })
})
