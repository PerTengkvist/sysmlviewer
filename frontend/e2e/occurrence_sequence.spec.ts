import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'
import {
  dragLifelineOver,
  lifelineOrder,
  nodeSel,
  resetSequenceLayout,
  sequenceLayoutOf,
} from './helpers/sequence'

/**
 * SysML v2 sequence diagrams written as `occurrence def`
 * (examples/diagrams/occurrence_sequences.sysml): every form of lifeline, the
 * Details of a lifeline and a message, a saved order, and the legacy
 * interaction form, which must still render.
 */

const P = 'OccurrenceSequences::'
const A = `${P}SequenceA`
const B = `${P}SequenceB`
const C = `${P}SequenceC`

let projectId = ''

test.beforeEach(async ({ page }) => {
  projectId = await openProject(page, exampleProjectFile('diagrams'))
})

const edgeSel = (id: string) => `.react-flow__edge[data-id="${id}"]`

async function selectNode(page: Page, id: string) {
  await page.locator(`${nodeSel(id)} .lifeline-header`).click()
  await expect(page.locator(nodeSel(id))).toHaveClass(/selected/)
}

function detail(page: Page, label: string) {
  return page.locator('.details-panel dt', { hasText: new RegExp(`^${label}$`) }).locator('+ dd')
}

test('redefinition form (SequenceA): the parts are lifelines, an unused part is not', async ({
  page,
}) => {
  await openView(page, `${P}SequenceAView`)
  await expect(page.locator(nodeSel(`${A}::a`))).toBeVisible()
  await expect(page.locator(nodeSel(`${A}::b`))).toBeVisible()
  await expect(page.locator(nodeSel(`${A}::c`))).toHaveCount(0)
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(2)
  await expect(page.locator(edgeSel(`${A}::msg`))).toHaveCount(1)
  await expect(page.locator(edgeSel(`${A}::msg`)).locator('path').first()).not.toHaveAttribute(
    'stroke-dasharray',
    /./,
  )
  // #Reply: dashed
  const dash = await page
    .locator(edgeSel(`${A}::ack`))
    .locator('path.react-flow__edge-path')
    .first()
    .evaluate((el) => getComputedStyle(el).strokeDasharray)
  expect(dash).not.toBe('none')
  await expect(page.locator('.message-edge-label', { hasText: /^1\. msg$/ })).toBeVisible()
})

test('typed form (SequenceB): two lifelines, type and reference in Details', async ({ page }) => {
  await openView(page, `${P}SequenceBView`)
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(2)
  await selectNode(page, `${B}::a`)
  await expect(detail(page, 'Type')).toContainText('PartA')
  await expect(detail(page, 'Reference')).toHaveText('yes')
  await selectNode(page, `${B}::b`)
  await expect(detail(page, 'Type')).toContainText('PartB')
  await expect(detail(page, 'Reference')).toHaveText('no')
})

test('chain subsetting and nested end (SequenceC)', async ({ page }) => {
  await openView(page, `${P}SequenceCView`)
  await expect(page.locator(nodeSel(`${C}::plant`))).toHaveCount(0)
  expect(await lifelineOrder(page)).toEqual([
    `${C}::operator`,
    `${C}::ctrl`,
    `${C}::plant::actuator`,
    `${C}::listener`,
  ])
  await selectNode(page, `${C}::ctrl`)
  await expect(detail(page, 'Subsets')).toContainText('controller (Plant)')
  await expect(detail(page, 'Type')).toContainText('Controller')
  await detail(page, 'Subsets').locator(`[data-related-id="${P}Plant::controller"]`).click()
  // The target opens in its own dialog.
  const dialog = page.getByRole('dialog', { name: /controller/ })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await selectNode(page, `${C}::listener`)
  await expect(detail(page, 'Subsets')).toContainText('partB')
  await selectNode(page, `${C}::plant::actuator`)
  await expect(detail(page, 'Redefines')).toContainText('actuator (Plant)')
})

test('selecting a message shows its events', async ({ page }) => {
  await openView(page, `${P}SequenceAView`)
  await fitView(page)
  await page.locator(edgeSel(`${A}::msg`)).locator('path').first().click({ force: true })
  await expect(detail(page, 'From')).toHaveText('a.sent')
  await expect(detail(page, 'To')).toHaveText('b.received')
})

test('a saved lifeline order survives a reload', async ({ page, request }) => {
  const view = `${P}SequenceAView`
  try {
    await openView(page, view)
    expect(await lifelineOrder(page)).toEqual([`${A}::a`, `${A}::b`])
    await dragLifelineOver(page, `${A}::a`, `${A}::b`)
    expect(await lifelineOrder(page)).toEqual([`${A}::b`, `${A}::a`])
    await expect
      .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
      .toEqual([`${A}::b`, `${A}::a`])
    await openView(page, view)
    expect(await lifelineOrder(page)).toEqual([`${A}::b`, `${A}::a`])
  } finally {
    await resetSequenceLayout(request, projectId, view)
  }
})

test('the legacy interaction still renders', async ({ page }) => {
  await openView(page, 'hbox::HBoxEventView')
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(4)
  await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)
})
