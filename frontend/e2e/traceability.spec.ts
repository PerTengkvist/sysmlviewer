import { expect, test } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Requirement traceability between use cases and requirements: the use case
 * dialog, the details relations list, a UseCaseView with two kinds of expose,
 * and the Use cases column of the requirement table.
 */

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
})

test('a UseCaseView shows the requirements its use cases trace to', async ({ page }) => {
  await openView(page, 'UseCases::UseCaseTraceabilityView')
  await expect(page.locator('.react-flow__node-useCase')).toHaveCount(12)
  await expect(page.locator('.react-flow__node-requirement')).toHaveCount(16)
  await expect(
    page.locator('.react-flow__edge-textwrapper, .react-flow__edgelabel-renderer *', {
      hasText: '«objective»',
    }).first(),
  ).toBeVisible()
  // Requirements sit to the right of the use cases.
  const uc = (await page.locator(nodeSel('UseCases::Driving::StartVehicle')).boundingBox())!
  const req = (await page.locator(nodeSel('Requirements::PowerModes')).boundingBox())!
  expect(req.x).toBeGreaterThan(uc.x + uc.width)
})

test('double-click on a use case lists its requirements and opens one', async ({ page }) => {
  await openView(page, 'UseCases::UseCaseTraceabilityView')
  await fitView(page)
  await page.locator(nodeSel('UseCases::Driving::StartVehicle')).dblclick()
  const dlg = page.getByRole('dialog', { name: 'Use case StartVehicle' })
  await expect(dlg).toBeVisible()
  const reqs = dlg.locator('.usecase-flow-requirements')
  await expect(reqs).toContainText('«objective»')
  await expect(reqs).toContainText('PowerModes')
  await expect(reqs).toContainText('«refine»')
  await expect(reqs).toContainText('DriveToDestination')

  await reqs.locator('[data-requirement-id="Requirements::DriveToDestination"]').click()
  await expect(dlg).toBeHidden()
  const details = page.getByRole('dialog', { name: /DriveToDestination/ })
  await expect(details).toBeVisible()
  const incoming = details.locator('.relations-list li[data-direction="in"]', {
    hasText: 'StartVehicle',
  })
  await expect(incoming).toContainText('«refine»')

  // And back: the use case at the far end opens the use case dialog again.
  await incoming.locator('[data-related-id="UseCases::Driving::StartVehicle"]').click()
  await expect(page.getByRole('dialog', { name: 'Use case StartVehicle' })).toBeVisible()
})

test('the requirement table names the use cases tracing to each requirement', async ({ page }) => {
  // A table view has no diagram nodes, so wait for the table itself.
  await page.goto(`/?view=${encodeURIComponent('Requirements::RequirementsTableView')}`)
  const table = page.locator('.requirement-table-canvas table')
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.locator('th', { hasText: 'Use cases' })).toBeVisible()
  const row = table.locator('tr[data-artifact-id="Requirements::DriveToDestination"]')
  await expect(row).toContainText('StartVehicle')
  await expect(row).toContainText('ChangeGear')
})

test('the use case flow enters steps at the top and draws a loop on the right', async ({ page }) => {
  await openView(page, 'UseCases::VehicleUseCaseView')
  await fitView(page)
  await page.locator(nodeSel('UseCases::Managing::Charge')).dblclick()
  const dlg = page.getByRole('dialog', { name: 'Use case Charge' })
  await expect(dlg).toBeVisible()
  const uc = 'UseCases::Managing::Charge'
  await expect(dlg.locator('.react-flow__edge')).toHaveCount(8)

  /** Flow-space box of a step and first/last point of an edge path. */
  const geometry = async (source: string, target: string, edgeId: string) =>
    dlg.evaluate(
      (root, { source, target, edgeId }) => {
        const box = (id: string) => {
          const el = root.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!
          const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform)!
          return { x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight }
        }
        const path = root.querySelector(
          `[data-testid="rf__edge-${edgeId}"] .react-flow__edge-path`,
        )!
        const n = (path.getAttribute('d') || '').match(/-?\d+(\.\d+)?/g)!.map(Number)
        return {
          s: box(source),
          t: box(target),
          start: { x: n[0], y: n[1] },
          end: { x: n[n.length - 2], y: n[n.length - 1] },
        }
      },
      { source, target, edgeId },
    )
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(8)

  // A plain step: out at the bottom centre, in at the top centre.
  const plain = await geometry(`${uc}::negotiateSession`, `${uc}::transferEnergy`, `${uc}::succ3`)
  near(plain.start.x, plain.s.x + plain.s.w / 2)
  near(plain.start.y, plain.s.y + plain.s.h)
  near(plain.end.x, plain.t.x + plain.t.w / 2)
  near(plain.end.y, plain.t.y)

  // The loop back from the decision: out on its right, in on the right of transferEnergy.
  const loop = await geometry(`${uc}::pluggedIn`, `${uc}::transferEnergy`, `${uc}::if_pluggedIn_yes`)
  near(loop.start.x, loop.s.x + loop.s.w)
  near(loop.end.x, loop.t.x + loop.t.w)
  near(loop.end.y, loop.t.y + loop.t.h / 2)
})

test('every use case opens a flow from start to done in its dialog', async ({ page }) => {
  test.setTimeout(300_000)
  const projectId = await openProject(page, exampleProjectFile('electric_car'))
  const res = await page.request.get(`/api/projects/${projectId}`)
  type El = { id: string; kind: string; name: string; parentId: string | null; typeRef: string | null }
  const semantic = ((await res.json()) as { semantic: Record<string, El> }).semantic
  const useCases = Object.values(semantic).filter((e) => e.kind === 'useCase')
  expect(useCases).toHaveLength(21)

  await openView(page, 'UseCases::VehicleUseCaseView')
  await fitView(page)
  const shown: Record<string, { nodes: number; edges: number }> = {}
  const expected: Record<string, { nodes: number; edges: number }> = {}
  for (const uc of useCases) {
    const kids = Object.values(semantic).filter((e) => e.parentId === uc.id)
    expected[uc.name] = {
      nodes: kids.filter((e) => e.kind === 'action').length,
      edges: kids.filter((e) => e.kind === 'succession').length,
    }
    // An «include» label can sit on top of a node in the fitted view; the
    // dialog, not hit testing, is under test here.
    await page.locator(nodeSel(uc.id)).dispatchEvent('dblclick')
    const dlg = page.getByRole('dialog', { name: `Use case ${uc.name}` })
    await expect(dlg).toBeVisible()
    await expect(dlg.locator(nodeSel(`${uc.id}::start`))).toBeVisible()
    await expect(dlg.locator(nodeSel(`${uc.id}::done`))).toBeVisible()
    await expect(dlg.locator('.react-flow__edge')).toHaveCount(expected[uc.name].edges)
    shown[uc.name] = {
      nodes: await dlg.locator('.react-flow__node').count(),
      edges: await dlg.locator('.react-flow__edge').count(),
    }
    await dlg.getByRole('button', { name: 'Close' }).click()
    await expect(dlg).toBeHidden()
  }
  expect(shown).toEqual(expected)
})
