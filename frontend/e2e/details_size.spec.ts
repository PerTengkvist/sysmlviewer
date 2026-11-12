import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

/**
 * The Size and Position fields in Details change the part on the canvas at
 * once, the change survives a reload, and the canvas can zoom out below 50 %.
 */

const VIEW = 'LogicalArchitecture::CarLogicalView'
// Each test uses its own part: the temp workspace keeps what a test saved.
const SIZED = 'LogicalArchitecture::Car::keyFob'
const MOVED = 'LogicalArchitecture::Car::battery'
const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

async function flowBox(page: Page, id: string) {
  return page.locator(nodeSel(id)).evaluate((el) => {
    const h = el as HTMLElement
    const m = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(h.style.transform)
    return {
      x: m ? Number(m[1]) : NaN,
      y: m ? Number(m[2]) : NaN,
      width: parseFloat(h.style.width),
      height: parseFloat(h.style.height),
    }
  })
}

async function selectPart(page: Page, id: string) {
  await page.locator(nodeSel(id)).click({ position: { x: 20, y: 10 } })
  await expect(page.locator(nodeSel(id))).toHaveClass(/selected/)
}

async function setField(page: Page, label: string, value: string) {
  const input = page.locator('.details-panel').getByLabel(label, { exact: true })
  await input.fill(value)
  await input.blur()
}

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, VIEW)
})

test('Width and Height in Details resize the part at once and after a reload', async ({ page }) => {
  await selectPart(page, SIZED)
  await setField(page, 'Width', '320')
  await setField(page, 'Height', '180')
  await expect.poll(() => flowBox(page, SIZED)).toMatchObject({ width: 320, height: 180 })
  await openView(page, VIEW)
  await expect.poll(() => flowBox(page, SIZED)).toMatchObject({ width: 320, height: 180 })
})

test('X and Y in Details move the part at once', async ({ page }) => {
  const before = await flowBox(page, MOVED)
  await selectPart(page, MOVED)
  await setField(page, 'X position', '800')
  await setField(page, 'Y position', '90')
  // battery was saved at (850, 60) inside its parent.
  await expect
    .poll(async () => {
      const b = await flowBox(page, MOVED)
      return { dx: Math.round(b.x - before.x), dy: Math.round(b.y - before.y) }
    })
    .toEqual({ dx: -50, dy: 30 })
})

test('the canvas zooms out below 50 %', async ({ page }) => {
  const zoomOut = page.locator('.react-flow__controls-zoomout')
  // React Flow disables the button at its minimum zoom.
  for (let i = 0; i < 12 && (await zoomOut.isEnabled()); i++) await zoomOut.click()
  const scale = await page.locator('.react-flow__viewport').evaluate((el) => {
    const m = /scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)
    return m ? Number(m[1]) : NaN
  })
  expect(scale).toBeLessThan(0.5)
})
