import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject, openView, runAutoLayout } from './helpers/diagram'

/**
 * Force grid shrinks parts that have grown too big, and no AutoLayout lets
 * one container swallow the others or grow on every run.
 */

type Size = { width: number; height: number }

async function sizes(page: Page): Promise<Record<string, Size>> {
  return page.evaluate(() => {
    const out: Record<string, { width: number; height: number }> = {}
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node-part')) {
      out[el.dataset.id || ''] = {
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height),
      }
    }
    return out
  })
}

async function screenBox(page: Page, id: string) {
  const b = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
  expect(b, id).not.toBeNull()
  return b!
}

test('Force grid shrinks a part that has grown too big, and stays put on a second run', async ({
  page,
}) => {
  const projectId = await openProject(page, exampleProjectFile('electric_car'))
  const view = 'Functions::FunctionsView'
  const grown = 'Functions::Charging'
  const res = await page.request.patch(`/api/projects/${projectId}/visualization`, {
    data: { viewId: view, nodes: { [grown]: { artifactId: grown, width: 600, height: 400 } } },
  })
  expect(res.ok()).toBeTruthy()
  await openView(page, view)
  expect((await sizes(page))[grown]).toEqual({ width: 600, height: 400 })

  await runAutoLayout(page, { mode: 'simple', algorithm: 'force-grid' })
  const first = await sizes(page)
  expect(first[grown]!.width).toBeLessThan(300)
  expect(first[grown]!.height).toBeLessThan(200)

  await runAutoLayout(page, { mode: 'simple', algorithm: 'force-grid' })
  expect(await sizes(page)).toEqual(first)
})

test('a second root stays beside the whitebox root, which does not grow', async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'PhysicalArchitecture::PhysicalDependenciesView')
  const root = 'PhysicalArchitecture::VehiclePhysical'
  const other = 'PhysicalArchitecture::LogicalCounterparts'

  await runAutoLayout(page, { mode: 'simple', algorithm: 'favour-grid' })
  const a = await screenBox(page, root)
  const b = await screenBox(page, other)
  const apart =
    a.x + a.width <= b.x + 1 ||
    b.x + b.width <= a.x + 1 ||
    a.y + a.height <= b.y + 1 ||
    b.y + b.height <= a.y + 1
  expect(apart, `${root} must not cover ${other}`).toBe(true)
  const once = (await sizes(page))[root]!

  await runAutoLayout(page, { mode: 'simple', algorithm: 'favour-grid' })
  const twice = (await sizes(page))[root]!
  expect(twice.width).toBeLessThanOrEqual(once.width + 0.5)
  expect(twice.height).toBeLessThanOrEqual(once.height + 0.5)
})
