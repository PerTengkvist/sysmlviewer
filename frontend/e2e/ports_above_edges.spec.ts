import { expect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

const NESTED_VIEW = 'HierarchicalPartsPkg::NestedPortsView'
const SHIPPED_VIEW = path.resolve('../examples/diagrams/views/NestedPortsView.json')
// The end of binding bind3 lies on this port.
const COVERED_PORT = 'HierarchicalPartsPkg::NestedPortsExample::client::c1::cP1'

function viewFile(): string {
  return path.join(path.dirname(exampleProjectFile('diagrams')), 'views', 'NestedPortsView.json')
}

type SavedNode = { side?: string; offset?: number }
type SavedEdge = { targetSide?: string; targetOffset?: number }

function saved(): { nodes: Record<string, SavedNode>; edges: Record<string, SavedEdge> } {
  return JSON.parse(readFileSync(viewFile(), 'utf8'))
}

async function portCenter(page: Page, portId: string) {
  const box = (await page.locator(`.react-flow__handle[data-port-id="${portId}"]`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function holdOption(page: Page) {
  await page.keyboard.down('Alt')
  await expect(page.locator('.diagram-canvas.tool-move-ports')).toBeVisible()
}

type Covered = { port: string; coveredBy: string }

/** Ports whose centre is not the topmost thing under the pointer. */
async function coveredPorts(page: Page): Promise<{ checked: number; covered: Covered[] }> {
  return page.evaluate(() => {
    const covered: { port: string; coveredBy: string }[] = []
    const handles = [
      ...document.querySelectorAll<HTMLElement>('.react-flow__handle[data-port-id]'),
    ]
    let checked = 0
    for (const handle of handles) {
      const box = handle.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
      checked += 1
      const top = document.elementFromPoint(x, y)
      // The port itself, or the copy drawn above connection grips in Option mode.
      const grab = top?.closest<HTMLElement>('[data-port-grab]')
      if (top === handle || handle.contains(top)) continue
      if (grab?.dataset.portGrab === handle.dataset.portId) continue
      covered.push({
        port: handle.dataset.portId ?? '',
        coveredBy: top ? `${top.tagName.toLowerCase()}.${String(top.className)}` : 'nothing',
      })
    }
    return { checked, covered }
  })
}

test.describe('ports above connections and bindings', () => {
  test('with Option held every port is on top', async ({ page }) => {
    test.setTimeout(600_000)
    const failures: Record<string, Covered[]> = {}
    let checked = 0
    for (const example of ['diagrams', 'electric_car'] as const) {
      const projectId = await openProject(page, exampleProjectFile(example))
      const res = await page.request.get(`/api/projects/${projectId}`)
      const project = (await res.json()) as { views: { id: string }[] }
      for (const view of project.views) {
        await page.goto(`/?view=${encodeURIComponent(view.id)}`)
        await page.waitForTimeout(900)
        if (!(await page.locator('.react-flow__handle[data-port-id]').count())) continue
        await page.keyboard.down('Alt')
        await expect(page.locator('.diagram-canvas.tool-move-ports')).toBeVisible()
        const found = await coveredPorts(page)
        await page.keyboard.up('Alt')
        checked += found.checked
        if (found.covered.length) failures[view.id] = found.covered
      }
    }
    expect(failures).toEqual({})
    expect(checked).toBeGreaterThan(20)
  })

  test.describe('in one diagram', () => {
    test.beforeEach(async ({ page }) => {
      writeFileSync(viewFile(), readFileSync(SHIPPED_VIEW, 'utf8'))
      await openProject(page, exampleProjectFile('diagrams'))
      await openView(page, NESTED_VIEW)
    })

    test('without Option nothing is drawn over the diagram', async ({ page }) => {
      await expect(page.locator('[data-port-grab]')).toHaveCount(0)
    })

    test('Option-drag on a port under a binding end moves the port', async ({ page }) => {
      const bindingBefore = saved().edges['HierarchicalPartsPkg::NestedPortsExample::client::bind3']
      const before = await portCenter(page, COVERED_PORT)
      await holdOption(page)

      await page.mouse.move(before.x, before.y)
      await page.mouse.down()
      await page.mouse.move(before.x, before.y - 12, { steps: 3 })
      await page.mouse.move(before.x, before.y - 24, { steps: 3 })
      await page.mouse.up()
      await page.keyboard.up('Alt')
      await page.waitForTimeout(600)

      const after = await portCenter(page, COVERED_PORT)
      expect(before.y - after.y).toBeGreaterThan(15)
      expect(saved().nodes[COVERED_PORT]?.offset).not.toBe(
        JSON.parse(readFileSync(SHIPPED_VIEW, 'utf8')).nodes[COVERED_PORT]?.offset,
      )
      // The port moved and the binding was rerouted, but its end was not dragged.
      const bindingAfter = saved().edges['HierarchicalPartsPkg::NestedPortsExample::client::bind3']
      expect(bindingAfter?.targetSide).toBe(bindingBefore?.targetSide)
      expect(bindingAfter?.targetOffset).toBe(bindingBefore?.targetOffset)
    })

    test('the drawn port follows while it is dragged', async ({ page }) => {
      const before = await portCenter(page, COVERED_PORT)
      await holdOption(page)
      await page.mouse.move(before.x, before.y)
      await page.mouse.down()
      await page.mouse.move(before.x, before.y - 24, { steps: 6 })

      const handle = await portCenter(page, COVERED_PORT)
      expect(before.y - handle.y).toBeGreaterThan(15)
      await expect
        .poll(async () => {
          const grab = (await page.locator(`[data-port-grab="${COVERED_PORT}"]`).boundingBox())!
          return Math.hypot(
            grab.x + grab.width / 2 - handle.x,
            grab.y + grab.height / 2 - handle.y,
          )
        }, { timeout: 500 })
        .toBeLessThan(1)

      await page.mouse.up()
      await page.keyboard.up('Alt')
    })

    test('Option+Shift click on a port under a binding end selects it', async ({ page }) => {
      const at = await portCenter(page, COVERED_PORT)
      await holdOption(page)
      await page.keyboard.down('Shift')

      await page.mouse.click(at.x, at.y)

      await expect(
        page.locator(`.react-flow__handle[data-port-id="${COVERED_PORT}"]`),
      ).toHaveClass(/port-handle-selected/)
      await expect(page.locator(`[data-port-grab="${COVERED_PORT}"]`)).toHaveClass(/selected/)
      await page.keyboard.up('Shift')
      await page.keyboard.up('Alt')
    })
  })
})
