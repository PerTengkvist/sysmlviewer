import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'
import {
  dragLifelineOver,
  lifelineOrder,
  nodeSel,
  openSequenceView,
  resetSequenceLayout,
  sequenceLayoutOf,
} from './helpers/sequence'

/**
 * SysML v2 sequence diagrams written as `occurrence def`
 * (examples/diagrams/occurrence_sequences.sysml): every form of lifeline, the
 * Details of a lifeline and a message, a saved order, and the legacy
 * interaction form, which must still render. The last tests are the electric car
 * after its migration: typed lifelines with the legacy ids, in the legacy order.
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
  await openSequenceView(page, `${P}SequenceAView`, 2)
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
  await openSequenceView(page, `${P}SequenceBView`, 2)
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(2)
  await selectNode(page, `${B}::a`)
  await expect(detail(page, 'Type')).toContainText('PartA')
  await expect(detail(page, 'Reference')).toHaveText('yes')
  await selectNode(page, `${B}::b`)
  await expect(detail(page, 'Type')).toContainText('PartB')
  await expect(detail(page, 'Reference')).toHaveText('no')
})

test('chain subsetting and nested end (SequenceC)', async ({ page }) => {
  await openSequenceView(page, `${P}SequenceCView`, 4)
  await expect(page.locator(nodeSel(`${C}::plant`))).toHaveCount(0)
  await expect.poll(() => lifelineOrder(page)).toEqual([
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
  await openSequenceView(page, `${P}SequenceAView`, 2)
  await fitView(page)
  await page.locator(edgeSel(`${A}::msg`)).locator('path').first().click({ force: true })
  await expect(detail(page, 'From')).toHaveText('a.sent')
  await expect(detail(page, 'To')).toHaveText('b.received')
})

test('a saved lifeline order survives a reload', async ({ page, request }) => {
  const view = `${P}SequenceAView`
  try {
    await openSequenceView(page, view, 2)
    await expect.poll(() => lifelineOrder(page)).toEqual([`${A}::a`, `${A}::b`])
    await dragLifelineOver(page, `${A}::a`, `${A}::b`)
    await expect.poll(() => lifelineOrder(page)).toEqual([`${A}::b`, `${A}::a`])
    await expect
      .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
      .toEqual([`${A}::b`, `${A}::a`])
    await openSequenceView(page, view, 2)
    await expect.poll(() => lifelineOrder(page)).toEqual([`${A}::b`, `${A}::a`])
  } finally {
    await resetSequenceLayout(request, projectId, view)
  }
})

test('the legacy interaction still renders', async ({ page }) => {
  await openSequenceView(page, 'hbox::HBoxEventView', 4)
  await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)
})

// ---- electric car after the migration to occurrence defs (phase 3) ----------

const UNLOCK = 'Dynamics::UnlockSequence'
const UNLOCK_VIEW = 'Dynamics::UnlockSequenceView'
const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../../backend/tests/fixtures/sequence_migration.json', import.meta.url),
    'utf8',
  ),
) as Record<string, { defaultOrder: string[]; messages: { name: string; reply: boolean }[] }>

test('electric car UnlockSequenceView after migration', async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openSequenceView(page, UNLOCK_VIEW, 7)
  const legacy = FIXTURE[UNLOCK]
  // The lifeline ids are the legacy ones, left to right in the default order.
  expect(legacy.defaultOrder).toHaveLength(7)
  expect(await lifelineOrder(page)).toEqual(legacy.defaultOrder)
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(7)
  await expect(page.locator('.react-flow__edge')).toHaveCount(8)
  expect(legacy.messages.filter((m) => m.reply)).toHaveLength(2)
  for (const m of legacy.messages) {
    const dash = await page
      .locator(edgeSel(`${UNLOCK}::${m.name}`))
      .locator('path.react-flow__edge-path')
      .first()
      .evaluate((el) => getComputedStyle(el).strokeDasharray)
    expect(dash === 'none', `${m.name} is ${m.reply ? 'dashed' : 'solid'}`).toBe(!m.reply)
  }
  await selectNode(page, `${UNLOCK}::keyFob`)
  await expect(detail(page, 'Type')).toContainText('KeyFob')
  await expect(detail(page, 'Reference')).toHaveText('yes')
  await selectNode(page, `${UNLOCK}::Driver`)
  await expect(detail(page, 'Type')).toContainText('Driver')
})

test('a sequenceLayout saved on lifeline ids applies', async ({ page, request }) => {
  const id = await openProject(page, exampleProjectFile('electric_car'))
  const legacy = FIXTURE[UNLOCK].defaultOrder
  const reversed = [...legacy].reverse()
  try {
    const res = await request.patch(`/api/projects/${id}/visualization`, {
      data: {
        viewId: UNLOCK_VIEW,
        structureNotation: 'sysmlv2',
        sequenceLayout: { order: reversed },
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    await openSequenceView(page, UNLOCK_VIEW, 7)
    expect(await lifelineOrder(page)).toEqual(reversed)
  } finally {
    await resetSequenceLayout(request, id, UNLOCK_VIEW)
  }
})

test('CarLogicalTree still renders all 27 parts, labelled by name', async ({ page, request }) => {
  const id = await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'LogicalArchitecture::CarLogicalTree')
  const view = await request.get(
    `/api/projects/${id}/views/${encodeURIComponent('LogicalArchitecture::CarLogicalTree')}`,
  )
  const semantic = ((await view.json()) as {
    semantic: Record<string, { kind: string; parentId?: string; name: string }>
  }).semantic
  const car = 'LogicalArchitecture::Car'
  const parts = Object.entries(semantic).filter(([, e]) => e.kind === 'part' && e.parentId === car)
  expect(parts).toHaveLength(27)
  for (const [pid, e] of parts) {
    const node = page.locator(nodeSel(pid))
    await expect(node).toHaveCount(1)
    // B14: the tree shows the usage name only, not `keyFob : KeyFob`.
    await expect(node).toContainText(e.name)
    await expect(node).not.toContainText(':')
  }
  // The new part defs live in LogicalArchitecture::Types and are not under Car.
  await expect(page.locator(nodeSel('LogicalArchitecture::Types::KeyFob'))).toHaveCount(0)
})

test('a logical Car part is tagged by its type name, not the package', async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'LogicalArchitecture::CarLogicalView')
  const key = page.locator(nodeSel('LogicalArchitecture::Car::keyFob'))
  await expect(key.locator('.stereotype.type')).toHaveText('«KF»')
  await expect(key.locator('.stereotype.type')).toHaveAttribute('title', 'KeyFob')
})
