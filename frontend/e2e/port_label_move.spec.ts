import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

const NESTED_VIEW = 'HierarchicalPartsPkg::NestedPortsView'
const SHIPPED_VIEW = path.resolve('../examples/diagrams/views/NestedPortsView.json')
// On a leaf part, and no line end covers it, so Option-drag grabs the port itself.
const PORT = 'HierarchicalPartsPkg::NestedPortsExample::serviceA::s2::sP2'

type ViewFile = { nodes: Record<string, { labelOffset?: { x: number; y: number } }> }

function viewFile(): string {
  return path.join(
    path.dirname(exampleProjectFile('diagrams')),
    'views',
    'NestedPortsView.json',
  )
}

function savedLabelOffset(portId: string) {
  return (JSON.parse(readFileSync(viewFile(), 'utf8')) as ViewFile).nodes[portId]?.labelOffset
}

function label(page: Page, portId: string): Locator {
  return page.locator(`[data-port-label="${portId}"]`)
}

function leader(page: Page, portId: string): Locator {
  return page.locator(`[data-leader-for="${portId}"]`)
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragLabel(page: Page, portId: string, dx: number, dy: number) {
  const from = await center(label(page, portId))
  await page.keyboard.down('Alt')
  await expect(label(page, portId)).toHaveClass(/movable/)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 })
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await page.waitForTimeout(400)
}

/** The line's two ends and the port and name boxes, all on screen. */
async function expectLineJoinsPortAndName(page: Page, portId: string) {
  const found = await page.evaluate((id) => {
    const key = CSS.escape(id)
    const line = document.querySelector<SVGLineElement>(`[data-leader-for="${key}"]`)
    const svg = line?.ownerSVGElement
    const handle = document.querySelector(`[data-port-id="${key}"]`)
    const name = document.querySelector(`[data-port-label="${key}"]`)
    if (!line || !svg || !handle || !name) return null
    const origin = svg.getBoundingClientRect()
    const matrix = svg.getScreenCTM()!
    const end = (x: string, y: string) => ({
      x: origin.left + Number(x) * matrix.a,
      y: origin.top + Number(y) * matrix.d,
    })
    const h = handle.getBoundingClientRect()
    const n = name.getBoundingClientRect()
    return {
      dash: line.getAttribute('stroke-dasharray'),
      start: end(line.getAttribute('x1')!, line.getAttribute('y1')!),
      finish: end(line.getAttribute('x2')!, line.getAttribute('y2')!),
      port: { x: h.left + h.width / 2, y: h.top + h.height / 2 },
      name: { left: n.left, right: n.right, top: n.top, bottom: n.bottom },
    }
  }, portId)
  expect(found, 'dashed line for the port').not.toBeNull()
  expect(found!.dash).toBeTruthy()
  expect(Math.abs(found!.start.x - found!.port.x)).toBeLessThan(1)
  expect(Math.abs(found!.start.y - found!.port.y)).toBeLessThan(1)
  expect(found!.finish.x).toBeGreaterThanOrEqual(found!.name.left - 1)
  expect(found!.finish.x).toBeLessThanOrEqual(found!.name.right + 1)
  expect(found!.finish.y).toBeGreaterThanOrEqual(found!.name.top - 1)
  expect(found!.finish.y).toBeLessThanOrEqual(found!.name.bottom + 1)
}

test.describe('moving a port name', () => {
  const portId = PORT

  // The tests share a workspace, so each starts from the shipped layout.
  test.beforeEach(async ({ page }) => {
    writeFileSync(viewFile(), readFileSync(SHIPPED_VIEW, 'utf8'))
    await openProject(page, exampleProjectFile('diagrams'))
    await openView(page, NESTED_VIEW)
  })

  test('a name at its default place has no line', async ({ page }) => {
    await expect(page.locator('[data-leader-for]')).toHaveCount(0)
  })

  test('a name does not move without Option', async ({ page }) => {
    const before = await center(label(page, portId))
    await page.mouse.move(before.x, before.y)
    await page.mouse.down()
    await page.mouse.move(before.x + 60, before.y + 40, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    expect(savedLabelOffset(portId)).toBeUndefined()
    await expect(leader(page, portId)).toHaveCount(0)
  })

  test('a moved name gets a dashed line and stays after a reload', async ({ page }) => {
    const before = await center(label(page, portId))

    await dragLabel(page, portId, 90, -70)

    const after = await center(label(page, portId))
    expect(Math.abs(after.x - before.x - 90)).toBeLessThan(2)
    expect(Math.abs(after.y - before.y + 70)).toBeLessThan(2)
    await expectLineJoinsPortAndName(page, portId)
    const saved = savedLabelOffset(portId)
    expect(saved).toBeTruthy()

    await page.reload()
    await page.locator('.react-flow__node').first().waitFor()
    await page.waitForTimeout(800)

    const restored = await center(label(page, portId))
    expect(Math.abs(restored.x - after.x)).toBeLessThan(2)
    expect(Math.abs(restored.y - after.y)).toBeLessThan(2)
    await expectLineJoinsPortAndName(page, portId)
  })

  test('Save confirms a moved name', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    const saved = savedLabelOffset(portId)

    const response = page.waitForResponse((r) => r.url().includes('/save-snapshot'))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const result = (await (await response).json()) as { status: string }

    expect(result.status).toBe('confirmed')
    expect(savedLabelOffset(portId)).toEqual(saved)
  })

  test('the name and line follow when the port moves', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    const nameBefore = await center(label(page, portId))
    const handle = page.locator(`[data-port-id="${portId}"]`)
    const portBefore = await center(handle)

    await page.keyboard.down('Alt')
    await expect(handle).toHaveClass(/port-handle-move/)
    await page.mouse.move(portBefore.x, portBefore.y)
    await page.mouse.down()
    const dy = portBefore.y < nameBefore.y ? 16 : -16
    await page.mouse.move(portBefore.x, portBefore.y + dy, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await page.waitForTimeout(500)

    const portAfter = await center(handle)
    const nameAfter = await center(label(page, portId))
    expect(portAfter.y).not.toBeCloseTo(portBefore.y, 0)
    expect(nameAfter.y - nameBefore.y).toBeCloseTo(portAfter.y - portBefore.y, 0)
    await expectLineJoinsPortAndName(page, portId)
    expect(savedLabelOffset(portId)).toBeTruthy()
  })

  test('the line stays attached when the part is moved', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    const owner = page.locator('.react-flow__node-part', {
      has: page.locator(`[data-port-label="${portId}"]`),
    }).last()
    const box = (await owner.boundingBox())!

    await page.mouse.move(box.x + 30, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    await expectLineJoinsPortAndName(page, portId)
  })

  test('the line stays attached when the part is resized', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    const owner = page
      .locator('.react-flow__node-part', {
        has: page.locator(`[data-port-label="${portId}"]`),
      })
      .last()
    const box = (await owner.boundingBox())!
    await page.mouse.click(box.x + 30, box.y + 12)
    const corner = owner.locator('.react-flow__resize-control.handle.bottom.right')
    const grip = await center(corner)
    const portBefore = await center(page.locator(`[data-port-id="${portId}"]`))

    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 80, grip.y + 90, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    const portAfter = await center(page.locator(`[data-port-id="${portId}"]`))
    expect(portAfter.y).toBeGreaterThan(portBefore.y + 5)
    await expectLineJoinsPortAndName(page, portId)
  })

  test('a name outside a boundary part moves too', async ({ page }) => {
    const boundaryPort = await page.evaluate(
      () =>
        document
          .querySelector('.port-label.outside')
          ?.getAttribute('data-port-label') ?? null,
    )
    expect(boundaryPort, 'a port name outside its part').toBeTruthy()
    const before = await center(label(page, boundaryPort!))

    await dragLabel(page, boundaryPort!, -40, 60)

    const after = await center(label(page, boundaryPort!))
    expect(Math.abs(after.y - before.y - 60)).toBeLessThan(2)
    await expectLineJoinsPortAndName(page, boundaryPort!)
  })

  test('dropping the name near its default place removes the line', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    await expect(leader(page, portId)).toHaveCount(1)

    await dragLabel(page, portId, -88, 69)

    await expect(leader(page, portId)).toHaveCount(0)
    expect(savedLabelOffset(portId)).toBeUndefined()
  })

  test('double-click puts the name back', async ({ page }) => {
    await dragLabel(page, portId, 90, -70)
    const moved = await center(label(page, portId))

    await page.keyboard.down('Alt')
    await expect(label(page, portId)).toHaveClass(/movable/)
    await page.mouse.dblclick(moved.x, moved.y)
    await page.keyboard.up('Alt')
    await page.waitForTimeout(400)

    await expect(leader(page, portId)).toHaveCount(0)
    expect(savedLabelOffset(portId)).toBeUndefined()
  })

  test('undo puts the name back', async ({ page }) => {
    const before = await center(label(page, portId))
    await dragLabel(page, portId, 90, -70)

    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForTimeout(600)

    await expect(leader(page, portId)).toHaveCount(0)
    const after = await center(label(page, portId))
    expect(Math.abs(after.x - before.x)).toBeLessThan(2)
    expect(savedLabelOffset(portId)).toBeUndefined()
  })
})
