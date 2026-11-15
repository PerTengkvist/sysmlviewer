import { expect, test, type Locator, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Activity diagrams, in the action flow view and the use case dialog:
 * start and done are small circles, a decision's handles are its diamond's
 * tips, and connection handles show only while Option (Alt) is held.
 */

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`
const UC = 'UseCases::Managing::Charge'
const FLOW = 'Functions::Security::securityFlow'

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
})

async function openCharge(page: Page): Promise<Locator> {
  await openView(page, 'UseCases::VehicleUseCaseView')
  await fitView(page)
  await page.locator(nodeSel(UC)).dblclick()
  const dlg = page.getByRole('dialog', { name: 'Use case Charge' })
  await expect(dlg.locator('.react-flow__edge')).toHaveCount(8)
  return dlg
}

/** Centres of a node's handles, relative to the centre of its diamond. */
async function decisionGeometry(node: Locator) {
  return node.evaluate((el) => {
    const shape = el.querySelector('.action-decision-diamond polygon')!.getBoundingClientRect()
    const cx = shape.left + shape.width / 2
    const cy = shape.top + shape.height / 2
    const handles = [...el.querySelectorAll<HTMLElement>('.react-flow__handle')].map((h) => {
      const r = h.getBoundingClientRect()
      return {
        id: h.dataset.handleid || '',
        dx: r.left + r.width / 2 - cx,
        dy: r.top + r.height / 2 - cy,
      }
    })
    return { w: shape.width, h: shape.height, handles }
  })
}

function expectHandlesAtTips(g: Awaited<ReturnType<typeof decisionGeometry>>) {
  const tip: Record<string, [number, number]> = {
    top: [0, -g.h / 2],
    bottom: [0, g.h / 2],
    left: [-g.w / 2, 0],
    right: [g.w / 2, 0],
  }
  expect(g.handles).toHaveLength(7)
  for (const h of g.handles) {
    const side = h.id.split('-').pop()!
    const [x, y] = tip[side]
    expect(Math.abs(h.dx - x), `${h.id} x`).toBeLessThan(2.5)
    expect(Math.abs(h.dy - y), `${h.id} y`).toBeLessThan(2.5)
  }
}

/** Visible connection handles: a dot drawn around the handle. */
async function visibleHandles(root: Locator): Promise<number> {
  return root.evaluate(
    (el) =>
      [...el.querySelectorAll('.react-flow__handle.flow-handle')].filter(
        (h) => getComputedStyle(h, '::after').visibility === 'visible',
      ).length,
  )
}

test('the use case dialog draws start and done as small circles', async ({ page }) => {
  const dlg = await openCharge(page)
  for (const id of ['start', 'done']) {
    const node = dlg.locator(nodeSel(`${UC}::${id}`))
    const box = (await node.locator('.action-pseudo').boundingBox())!
    expect(Math.abs(box.width - box.height), id).toBeLessThan(1)
    // As small as in the action flow view, not a 160 px ellipse.
    const flowPx = await node.evaluate((el) => el.offsetWidth)
    expect(flowPx, id).toBe(28)
  }
})

test('a decision diamond has its handles at its tips', async ({ page }) => {
  const dlg = await openCharge(page)
  expectHandlesAtTips(await decisionGeometry(dlg.locator(nodeSel(`${UC}::pluggedIn`))))

  // The step above enters the diamond at its top tip; else leaves at the bottom tip.
  const geo = await dlg.evaluate((root, uc) => {
    const el = root.querySelector<HTMLElement>(`.react-flow__node[data-id="${uc}::pluggedIn"]`)!
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform)!
    const ends = (edgeId: string) => {
      const d = root
        .querySelector(`[data-testid="rf__edge-${edgeId}"] .react-flow__edge-path`)!
        .getAttribute('d')!
      const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
      return { start: { x: n[0], y: n[1] }, end: { x: n[n.length - 2], y: n[n.length - 1] } }
    }
    return {
      box: { x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight },
      into: ends(`${uc}::succ5`).end,
      out: ends(`${uc}::if_pluggedIn_else`).start,
    }
  }, UC)
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2)
  near(geo.into.x, geo.box.x + geo.box.w / 2)
  near(geo.into.y, geo.box.y)
  near(geo.out.x, geo.box.x + geo.box.w / 2)
  near(geo.out.y, geo.box.y + geo.box.h)

  await openView(page, 'Functions::SecurityFlowView')
  await fitView(page)
  expectHandlesAtTips(await decisionGeometry(page.locator(nodeSel(`${FLOW}::credentialValid`))))
})

test('connection handles show only while Option is held', async ({ page }) => {
  await openView(page, 'Functions::SecurityFlowView')
  await fitView(page)
  const canvas = page.locator('.diagram-canvas')
  await expect(canvas).not.toHaveClass(/show-handles/)
  expect(await visibleHandles(canvas)).toBe(0)

  await page.keyboard.down('Alt')
  await expect(canvas).toHaveClass(/show-handles/)
  expect(await visibleHandles(canvas)).toBeGreaterThan(20)
  await page.keyboard.up('Alt')
  await expect(canvas).not.toHaveClass(/show-handles/)
  expect(await visibleHandles(canvas)).toBe(0)

  const dlg = await openCharge(page)
  const flow = dlg.locator('.usecase-flow-canvas')
  expect(await visibleHandles(flow)).toBe(0)
  await page.keyboard.down('Alt')
  await expect(flow).toHaveClass(/show-handles/)
  expect(await visibleHandles(flow)).toBeGreaterThan(20)
  await page.keyboard.up('Alt')
  await expect(flow).not.toHaveClass(/show-handles/)
  expect(await visibleHandles(flow)).toBe(0)
})
