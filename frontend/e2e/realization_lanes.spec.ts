import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { exampleProjectFile, openProject } from './helpers/diagram'

/**
 * Swimlane activity of a use case (examples/diagrams/use_case_realization.sysml): an
 * ActionFlowView on a use case draws its steps on lanes. White box (the default) has a lane per
 * function node, black box the actors and the system, logical a lane per logical part.
 */

const P = 'UseCaseRealization::'
const START = `${P}UC::Start`
const DRIVE = `${P}UC::Drive`
const SEC = `${P}F::Security`
const AUTH = `${SEC}::auth`
const IMMO = `${SEC}::immo`
const VC = `${P}L::vc`
const DRIVER = `${START}::Driver`
const FLOW = `${SEC}::startFlow`
const VIEW = `${P}StartRealization`

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`
const laneSel = (id: string) => nodeSel(`lane:${id}`)
const modeButton = (mode: string) => `[data-lane-mode="${mode}"]`

let projectId = ''

test.beforeEach(async ({ page, request }) => {
  projectId = await openProject(page, exampleProjectFile('diagrams'))
  await saveLayout(request, null)
})
test.afterEach(async ({ request }) => {
  await saveLayout(request, null)
})

async function saveLayout(request: APIRequestContext, layout: unknown) {
  const res = await request.patch(`/api/projects/${projectId}/visualization`, {
    data: { viewId: VIEW, structureNotation: 'sysmlv2', useCaseRealizationLayout: layout },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

async function savedLayout(request: APIRequestContext) {
  const res = await request.get(`/api/projects/${projectId}/views/${encodeURIComponent(VIEW)}`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { useCaseRealizationLayout: Record<string, unknown> | null })
    .useCaseRealizationLayout
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox()
  expect(b, `${selector} is drawn`).not.toBeNull()
  return b!
}

/** Lane ids as drawn, left to right (read in one go, so a rebuild cannot split the read). */
async function laneOrder(page: Page): Promise<string[]> {
  const lanes = await page.locator('.react-flow__node-lane').evaluateAll((els) =>
    els.map((el) => ({
      id: el.querySelector('.rlane')?.getAttribute('data-lane-id') ?? '',
      x: el.getBoundingClientRect().x,
    })),
  )
  return lanes.sort((a, b) => a.x - b.x).map((l) => l.id)
}

/** Open the view and wait until its lanes and steps are drawn and have stopped moving. */
async function openLanes(page: Page, viewId = VIEW): Promise<void> {
  await page.goto(`/?view=${encodeURIComponent(viewId)}`)
  await expect(page.locator('.react-flow__node-lane').first()).toBeVisible({ timeout: 60_000 })
  let previous = ''
  await expect
    .poll(async () => {
      const now = (
        await page
          .locator('.react-flow__node')
          .evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform).join('|'))
      )
      const settled = now === previous
      previous = now
      return settled
    })
    .toBe(true)
}

async function dragLaneOver(page: Page, id: string, target: string): Promise<void> {
  const from = await box(page, `${laneSel(id)} .rlane-header`)
  const to = await box(page, `${laneSel(target)} .rlane-header`)
  const y = from.y + from.height / 2
  await page.mouse.move(from.x + from.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, y, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2 + 40, y, { steps: 12 })
  await page.mouse.up()
}

test('white box is the default: a lane per actor and function node, then system', async ({ page }) => {
  await openLanes(page)
  await expect(page.locator('.diagram-mode-badge')).toContainText('Use case realization')
  await expect(page.locator(`${modeButton('whitebox')}[aria-pressed="true"]`)).toBeVisible()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, AUTH, IMMO, 'system'])
  const xs = await Promise.all([DRIVER, AUTH, IMMO, 'system'].map(async (l) => (await box(page, laneSel(l))).x))
  for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  await expect(page.locator(`${laneSel(DRIVER)} .rlane-actor`)).toContainText('actor')
  // The frame over the lanes of Security.
  await expect(page.locator('.rlane-group')).toHaveCount(1)
  await expect(page.locator('.rlane-group')).toContainText('Security')
})

test('a function step stands in the lane of its node, between the steps around it', async ({ page }) => {
  await openLanes(page)
  const check = `${FLOW}::checkKeyInCabin`
  const release = `${FLOW}::releaseImmobilizer`
  const press = `${START}::pressStart`
  const inLane = async (step: string, lane: string) => {
    const s = await box(page, nodeSel(step))
    const l = await box(page, laneSel(lane))
    return s.x >= l.x && s.x + s.width <= l.x + l.width
  }
  expect(await inLane(check, AUTH)).toBe(true)
  expect(await inLane(release, IMMO)).toBe(true)
  expect(await inLane(press, DRIVER)).toBe(true)
  const y = async (id: string) => (await box(page, nodeSel(id))).y
  expect(await y(press)).toBeLessThan(await y(check))
  expect(await y(check)).toBeLessThan(await y(release))
  // The use case steps they realize are replaced, not drawn as well.
  await expect(page.locator(nodeSel(`${START}::checkKey`))).toHaveCount(0)
})

test('a function step that refines an actor step follows it in its own lane', async ({ page, request }) => {
  await openLanes(page)
  const press = `${START}::pressStart`
  const read = `${SEC}::requestFlow::readStartRequest`
  const check = `${FLOW}::checkKeyInCabin`
  await expect(page.locator(nodeSel(read))).toBeVisible()
  const inLane = async (id: string, lane: string) => {
    const s = await box(page, nodeSel(id))
    const l = await box(page, laneSel(lane))
    return s.x >= l.x && s.x + s.width <= l.x + l.width
  }
  expect(await inLane(press, DRIVER)).toBe(true)
  expect(await inLane(read, AUTH)).toBe(true)
  const y = async (id: string) => (await box(page, nodeSel(id))).y
  expect(await y(press)).toBeLessThan(await y(read))
  expect(await y(read)).toBeLessThan(await y(check))
  // Its node is a step lane, not a lane without steps.
  await expect(page.locator(`${laneSel(AUTH)} .rlane`)).not.toHaveClass(/explicit-link|projected/)
  await page.locator(modeButton('blackbox')).click()
  await expect(page.locator(nodeSel(read))).toHaveCount(0)
  await expect.poll(async () => (await savedLayout(request))?.lanes).toBe('blackbox')
})

test('an unrealized system step stays in the system lane, marked', async ({ page }) => {
  await openLanes(page)
  const step = nodeSel(`${START}::askForBrake`)
  await expect(page.locator(`${step} .action-node`)).toHaveClass(/unrealized/)
  await expect(page.locator(step)).toContainText('⚠')
  const s = await box(page, step)
  const lane = await box(page, laneSel('system'))
  expect(s.x).toBeGreaterThanOrEqual(lane.x)
  expect(s.x + s.width).toBeLessThanOrEqual(lane.x + lane.width)
  // Realized steps carry no mark.
  await expect(page.locator(`${nodeSel(`${FLOW}::checkKeyInCabin`)} .action-node`)).not.toHaveClass(/unrealized/)
})

test('logical puts both function steps in the lane of vc', async ({ page, request }) => {
  await openLanes(page)
  await page.locator(modeButton('logical')).click()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, VC, 'system'])
  const lane = await box(page, laneSel(VC))
  for (const step of ['checkKeyInCabin', 'releaseImmobilizer']) {
    const s = await box(page, nodeSel(`${FLOW}::${step}`))
    expect(s.x).toBeGreaterThanOrEqual(lane.x)
    expect(s.x + s.width).toBeLessThanOrEqual(lane.x + lane.width)
  }
  await expect.poll(async () => (await savedLayout(request))?.lanes).toBe('logical')
})

test('black box has the actor and the system, with the steps of the use case', async ({ page, request }) => {
  await openLanes(page)
  await page.locator(modeButton('blackbox')).click()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, 'system'])
  await expect(page.locator('.react-flow__node-lane')).toHaveCount(2)
  await expect(page.locator(nodeSel(`${START}::checkKey`))).toBeVisible()
  await expect(page.locator(nodeSel(`${FLOW}::checkKeyInCabin`))).toHaveCount(0)
  // The choice is saved before the test ends, so that it cannot land in the next one.
  await expect.poll(async () => (await savedLayout(request))?.lanes).toBe('blackbox')
})

test('the mode and the lane order survive a reload, and Redraw forgets the order', async ({ page, request }) => {
  await openLanes(page)
  await dragLaneOver(page, AUTH, IMMO)
  const swapped = [DRIVER, IMMO, AUTH, 'system']
  await expect.poll(() => laneOrder(page)).toEqual(swapped)
  await expect.poll(async () => ((await savedLayout(request))?.order as Record<string, string[]>)?.whitebox).toEqual(swapped)
  // The steps went with their lanes.
  const check = await box(page, nodeSel(`${FLOW}::checkKeyInCabin`))
  const auth = await box(page, laneSel(AUTH))
  expect(check.x).toBeGreaterThanOrEqual(auth.x)
  expect(check.x + check.width).toBeLessThanOrEqual(auth.x + auth.width)

  await page.locator(modeButton('logical')).click()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, VC, 'system'])
  await expect.poll(async () => (await savedLayout(request))?.lanes).toBe('logical')

  await openLanes(page)
  await expect(page.locator(`${modeButton('logical')}[aria-pressed="true"]`)).toBeVisible()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, VC, 'system'])
  await page.locator(modeButton('whitebox')).click()
  await expect.poll(() => laneOrder(page)).toEqual(swapped)

  await page.getByRole('button', { name: 'Redraw', exact: true }).click()
  await expect.poll(() => laneOrder(page)).toEqual([DRIVER, AUTH, IMMO, 'system'])
  await expect
    .poll(async () => (await savedLayout(request)) ?? {})
    .toEqual({ lanes: 'whitebox' })
})

test('a lane can be made wider and keeps the width after a reload', async ({ page, request }) => {
  await openLanes(page)
  const header = `${laneSel(AUTH)} .rlane-header`
  await page.locator(header).click()
  await expect(page.locator(laneSel(AUTH))).toHaveClass(/selected/)
  const before = (await box(page, laneSel(AUTH))).width
  const handle = await box(page, `${laneSel(AUTH)} .rlane-resize-handle`)
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y, { steps: 4 })
  await page.mouse.move(x + 120, y, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await box(page, laneSel(AUTH))).width).toBeGreaterThan(before + 40)
  await expect
    .poll(async () => ((await savedLayout(request))?.widths as Record<string, number> | undefined)?.[AUTH])
    .toBeGreaterThan(0)
  const widths = (await savedLayout(request))?.widths as Record<string, number>
  await openLanes(page)
  await expect.poll(async () => (await box(page, laneSel(AUTH))).width).toBeGreaterThan(before + 40)
  expect(widths[AUTH]).toBeGreaterThan(before / 2)
})

test('DriveRealization draws the included use cases as call nodes that open their views', async ({ page }) => {
  await openLanes(page, `${P}DriveRealization`)
  const start = nodeSel(`${DRIVE}::include_Start`)
  await expect(page.locator(start)).toContainText('▸ Start')
  await expect(page.locator(nodeSel(`${DRIVE}::include_Unlock`))).toContainText('▸ Unlock')
  // Drive has no steps of its own; what its included use cases reach (through include) are
  // lanes without steps: the function nodes, then system.
  await expect.poll(() => laneOrder(page)).toEqual([AUTH, IMMO, `${SEC}::locks`, 'system'])
  await expect(page.locator(`${laneSel(AUTH)} .rlane`)).toHaveClass(/explicit-link|projected/)
  await page.locator(start).dblclick()
  // Start has a view of its own (StartRealization): its lanes appear.
  await expect(page.locator(laneSel(AUTH))).toBeVisible({ timeout: 30_000 })
})
