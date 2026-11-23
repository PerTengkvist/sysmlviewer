import { expect, test } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Electric car → Functions: one action flow per function, with the
 * functional entity (FunctionNode) that performs each step shown in the
 * action box, and the abstract FunctionNode definition in FunctionsView.
 */

const FLOW = 'Functions::Security::securityFlow'
const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
})

test('SecurityFlowView shows every step with its performer', async ({ page }) => {
  await openView(page, 'Functions::SecurityFlowView')
  await fitView(page)

  const steps: Record<string, string> = {
    checkCredential: 'authenticate',
    unlockDoors: 'lockControl',
    wakeCabin: 'wakeUp',
    rejectKey: 'authenticate',
  }
  for (const id of ['start', 'credentialValid', 'done', ...Object.keys(steps)]) {
    await expect(page.locator(nodeSel(`${FLOW}::${id}`))).toBeVisible()
  }
  // Only the flow is drawn; the performing parts are not nodes. The immobilizer is
  // released in startFlow, not on unlock.
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
  await expect(page.locator(nodeSel(`${FLOW}::releaseImmobilizer`))).toHaveCount(0)

  for (const [step, performer] of Object.entries(steps)) {
    const row = page.locator(`${nodeSel(`${FLOW}::${step}`)} .action-performer`)
    await expect(row).toHaveText(`⟨${performer}⟩`)
    await expect(row).toBeVisible()
  }
  // The performer row fits inside the action box.
  const box = (await page.locator(nodeSel(`${FLOW}::checkCredential`)).boundingBox())!
  const row = (await page
    .locator(`${nodeSel(`${FLOW}::checkCredential`)} .action-performer`)
    .boundingBox())!
  expect(row.y + row.height).toBeLessThanOrEqual(box.y + box.height + 1)

  await expect(page.locator(nodeSel(`${FLOW}::credentialValid`))).toContainText(
    'Credential Valid?',
  )
})

test('SecurityCabinAccessFlowView shows the door and window steps with their performers', async ({
  page,
}) => {
  const flow = 'Functions::Security::cabinAccessFlow'
  await openView(page, 'Functions::SecurityCabinAccessFlowView')
  await fitView(page)

  const steps: Record<string, string> = {
    readDoorHandle: 'doorControl',
    checkUnlocked: 'lockControl',
    releaseDoor: 'doorControl',
    stayLatched: 'lockControl',
    closeDoor: 'doorControl',
    relatch: 'lockControl',
    keepDoorAjar: 'doorControl',
    runWindowLift: 'windowControl',
  }
  const pseudo = ['start', 'doorRequested', 'outsideHandle', 'carUnlocked', 'doorLatched', 'done']
  for (const id of [...pseudo, ...Object.keys(steps)]) {
    await expect(page.locator(nodeSel(`${flow}::${id}`))).toBeVisible()
  }
  await expect(page.locator('.react-flow__node')).toHaveCount(14)
  for (const [step, performer] of Object.entries(steps)) {
    await expect(page.locator(`${nodeSel(`${flow}::${step}`)} .action-performer`)).toHaveText(
      `⟨${performer}⟩`,
    )
  }
  // Saved top-down: the door path runs down the first column.
  const ys: number[] = []
  const doorPath = [
    'start',
    'doorRequested',
    'readDoorHandle',
    'outsideHandle',
    'checkUnlocked',
    'carUnlocked',
    'releaseDoor',
    'closeDoor',
    'doorLatched',
    'relatch',
    'done',
  ]
  for (const id of doorPath) {
    ys.push((await page.locator(nodeSel(`${flow}::${id}`)).boundingBox())!.y)
  }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys)
})

test('SecurityFlowView labels the branches and not the generated successions', async ({
  page,
}) => {
  await openView(page, 'Functions::SecurityFlowView')
  const labels = await page
    .locator('.react-flow__edge-text, .react-flow__edge-textwrapper')
    .allTextContents()
  const texts = labels.map((t) => t.trim()).filter(Boolean)
  expect(texts.filter((t) => /^(s|succ)\d+$/i.test(t))).toEqual([])
  expect(texts).toContain('YES')
  expect(texts).toContain('NO')
  await expect(page.getByText(/^succ\d+$/)).toHaveCount(0)
})

test('the saved top-down layout reopens top-down', async ({ page }) => {
  const projectId = await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'Functions::ChargingFlowView')
  const flow = 'Functions::Charging::chargingFlow'
  const ids = ['start', 'detectPlug', 'negotiateCurrent', 'stopAtTarget', 'done']
  const ys: number[] = []
  for (const id of ids) {
    ys.push((await page.locator(nodeSel(`${flow}::${id}`)).boundingBox())!.y)
  }
  expect([...ys].sort((a, b) => a - b)).toEqual(ys)

  // The direction is not stored, so it is read from the layout: the edge
  // leaves the bottom of detectPlug, not its right side.
  const res = await page.request.get(
    `/api/projects/${projectId}/views/${encodeURIComponent('Functions::ChargingFlowView')}`,
  )
  const view = (await res.json()) as {
    semantic: Record<string, { id: string; kind: string; sourceId: string | null }>
  }
  const succ = Object.values(view.semantic).find(
    (e) => e.kind === 'succession' && e.sourceId === `${flow}::detectPlug`,
  )!
  const start = await page
    .locator(`.react-flow__edge[data-id="${succ.id}"] path.react-flow__edge-path`)
    .evaluate((path) => {
      const p = path as SVGPathElement
      const pt = p.getPointAtLength(0)
      const m = p.getScreenCTM()!
      return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f }
    })
  const box = (await page.locator(nodeSel(`${flow}::detectPlug`)).boundingBox())!
  expect(Math.abs(start.y - (box.y + box.height))).toBeLessThan(10)
  expect(Math.abs(start.x - (box.x + box.width / 2))).toBeLessThan(10)
})

test('FunctionsView shows the abstract FunctionNode next to Function', async ({ page }) => {
  await openView(page, 'Functions::FunctionsView')
  for (const name of ['Function', 'FunctionNode']) {
    const node = page.locator(nodeSel(`Functions::${name}`))
    await expect(node).toBeVisible()
    await expect(node).toContainText('«abstract part def»')
    await expect(node.locator('.part-node-title.is-abstract')).toHaveText(name)
  }
  const fn = (await page.locator(nodeSel('Functions::Function')).boundingBox())!
  const fnNode = (await page.locator(nodeSel('Functions::FunctionNode')).boundingBox())!
  expect(Math.abs(fnNode.y - fn.y)).toBeLessThan(5)
  expect(fnNode.x).toBeGreaterThan(fn.x + fn.width)
  // The flows' actions are filtered out of the GeneralView.
  await expect(page.locator('.react-flow__node-action')).toHaveCount(0)
})
