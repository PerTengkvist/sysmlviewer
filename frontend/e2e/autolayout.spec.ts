import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  exampleProjectFile,
  fitView,
  openProject,
  openView,
  runAutoLayout,
  type AutoLayoutChoice,
} from './helpers/diagram'
import {
  evaluateGeometry,
  readDiagramGeometry,
  readParentOf,
} from './helpers/geometry'

const OUTPUT_DIR = path.resolve(
  process.env.E2E_OUTPUT_DIR || path.join('e2e', 'output', 'latest'),
)

type ViewCase = {
  slug: string
  example: 'electric_car' | 'diagrams'
  viewId: string
}

const VIEWS: ViewCase[] = [
  {
    slug: 'physical',
    example: 'electric_car',
    viewId: 'PhysicalArchitecture::PhysicalView',
  },
  {
    slug: 'car-logical',
    example: 'electric_car',
    viewId: 'LogicalArchitecture::CarLogicalView',
  },
  { slug: 'example', example: 'diagrams', viewId: 'Example::ExampleView' },
  { slug: 'hbox', example: 'diagrams', viewId: 'hbox::HBoxView' },
]

const ALGORITHMS: { slug: string; choice: AutoLayoutChoice }[] = [
  { slug: 'clustered', choice: { mode: 'simple', algorithm: 'clustered' } },
  { slug: 'favour-grid', choice: { mode: 'simple', algorithm: 'favour-grid' } },
  { slug: 'flow-layered', choice: { mode: 'simple', algorithm: 'layered' } },
  { slug: 'stress', choice: { mode: 'simple', algorithm: 'stress' } },
  {
    slug: 'hierarchic-right',
    choice: { mode: 'advanced', pipeline: 'hierarchic', portPlacement: 'optimized' },
  },
  {
    slug: 'hierarchic-down-io',
    choice: {
      mode: 'advanced',
      pipeline: 'hierarchic',
      portPlacement: 'inputsLeftOutputsRight',
      hierarchic: { 'al-h-direction': 'DOWN' },
    },
  },
  {
    slug: 'hierarchic-incremental',
    choice: {
      mode: 'advanced',
      pipeline: 'hierarchic',
      hierarchic: { 'al-h-incremental': true },
    },
  },
]

test.describe('AutoLayout evaluation', () => {
  for (const view of VIEWS) {
    for (const algo of ALGORITHMS) {
      test(`${view.slug} × ${algo.slug}`, async ({ page }) => {
        const projectId = await openProject(page, exampleProjectFile(view.example))
        await openView(page, view.viewId)
        await runAutoLayout(page, algo.choice)
        await fitView(page)

        mkdirSync(OUTPUT_DIR, { recursive: true })
        const base = path.join(OUTPUT_DIR, `${view.slug}--${algo.slug}`)
        await page.screenshot({ path: `${base}.png`, fullPage: false })

        const geo = await readDiagramGeometry(page)
        const parentOf = await readParentOf(page, projectId, view.viewId)
        const report = evaluateGeometry(geo, parentOf)
        writeFileSync(`${base}.json`, JSON.stringify(report, null, 2))
        test.info().annotations.push({
          type: 'metrics',
          description: JSON.stringify({
            parts: report.parts,
            edges: report.edges,
            overlaps: report.overlaps,
            outsideParent: report.outsideParent.length,
            edgeThroughParts: report.edgeThroughParts,
            crossings: report.crossings,
            bends: report.bends,
            area: Math.round(report.boundingArea),
          }),
        })

        expect(report.parts, 'parts rendered').toBeGreaterThan(0)
        expect.soft(report.overlapPairs, 'overlapping parts').toEqual([])
        expect.soft(report.outsideParent, 'parts outside parent').toEqual([])
      })
    }
  }
})

test.describe('Layout Rules — layered layout', () => {
  test('car-logical: three top-down layers with belong-to rules', async ({ page }) => {
    const projectId = await openProject(page, exampleProjectFile('electric_car'))
    const viewId = 'LogicalArchitecture::CarLogicalView'
    // Seed layered config + rules through the API (same path as the dialog).
    const res = await page.request.patch(
      `/api/projects/${encodeURIComponent(projectId)}/visualization`,
      {
        data: {
          viewId,
          structureNotation: 'sysmlv2',
          layeredLayout: {
            enabled: true,
            scopes: [
              {
                id: 's1',
                scopePattern: '*',
                direction: 'top-down',
                layers: [
                  { id: 'l1', name: 'Driver' },
                  { id: 'l2', name: 'Control' },
                  { id: 'l3', name: 'Actuation' },
                ],
              },
            ],
          },
          layoutRules: [
            { id: 'r1', kind: 'part', namePattern: 'steeringWheel', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Driver' },
            { id: 'r2', kind: 'part', namePattern: '*Pedal', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Driver' },
            { id: 'r3', kind: 'part', namePattern: 'engine', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Control' },
            { id: 'r4', kind: 'part', namePattern: 'battery', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Control' },
            { id: 'r5', kind: 'part', namePattern: 'wheels', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Actuation' },
            { id: 'r6', kind: 'part', namePattern: 'battery', placement: 'to the left of', peerKind: 'part', peerNamePattern: 'engine' },
          ],
        },
      },
    )
    expect(res.ok()).toBeTruthy()
    await openView(page, viewId)
    await page.getByRole('button', { name: 'Layout Rules' }).click()
    const dlg = page.getByRole('dialog', { name: 'LayoutWizard' })
    await dlg.waitFor()
    await expect(dlg.getByTestId('lw-layered-enabled')).toBeChecked()
    await dlg.getByTestId('lw-apply').click()
    await dlg.waitFor({ state: 'detached', timeout: 150_000 })
    await page.waitForTimeout(800)
    await fitView(page)

    mkdirSync(OUTPUT_DIR, { recursive: true })
    const base = path.join(OUTPUT_DIR, 'car-logical--layered-rules')
    await page.screenshot({ path: `${base}.png` })
    const geo = await readDiagramGeometry(page)
    const parentOf = await readParentOf(page, projectId, viewId)
    const report = evaluateGeometry(geo, parentOf)
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 2))

    const rect = (suffix: string) =>
      geo.rects.find((r) => r.id.endsWith(`::${suffix}`))!
    const cy = (suffix: string) => (rect(suffix).minY + rect(suffix).maxY) / 2
    expect(cy('steeringWheel')).toBeLessThan(cy('engine'))
    expect(cy('engine')).toBeLessThan(cy('wheels'))
    expect(Math.abs(cy('engine') - cy('battery'))).toBeLessThan(1)
    expect(rect('battery').maxX).toBeLessThanOrEqual(rect('engine').minX)
    expect.soft(report.overlapPairs, 'overlapping parts').toEqual([])
    expect.soft(report.outsideParent, 'parts outside parent').toEqual([])
  })
})

test.describe('Layout Rules — scoped layers inside a container', () => {
  test('physical: two layers inside infotainmentEcu plus root layers', async ({ page }) => {
    const projectId = await openProject(page, exampleProjectFile('electric_car'))
    const viewId = 'PhysicalArchitecture::PhysicalView'
    const res = await page.request.patch(
      `/api/projects/${encodeURIComponent(projectId)}/visualization`,
      {
        data: {
          viewId,
          structureNotation: 'sysmlv2',
          layeredLayout: {
            enabled: true,
            scopes: [
              {
                id: 's1',
                scopePattern: '*',
                direction: 'top-down',
                layers: [
                  { id: 'l1', name: 'Body' },
                  { id: 'l2', name: 'Control' },
                  { id: 'l3', name: 'Drive' },
                ],
              },
              {
                id: 's2',
                scopePattern: 'infotainmentEcu',
                direction: 'top-down',
                layers: [
                  { id: 'l1', name: 'Comfort' },
                  { id: 'l2', name: 'Media' },
                ],
              },
            ],
          },
          layoutRules: [
            { id: 'r1', kind: 'part', namePattern: 'infotainmentEcu', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Control' },
            { id: 'r2', kind: 'part', namePattern: 'bodyShell', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Body' },
            { id: 'r3', kind: 'part', namePattern: 'wheelSet', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Drive' },
            { id: 'r4', kind: 'part', namePattern: 'climateControlSw', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Comfort' },
            { id: 'r5', kind: 'part', namePattern: 'entertainmentSw', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Media' },
          ],
        },
      },
    )
    expect(res.ok()).toBeTruthy()
    await openView(page, viewId)
    await page.getByRole('button', { name: 'Layout Rules' }).click()
    const dlg = page.getByRole('dialog', { name: 'LayoutWizard' })
    await dlg.waitFor()
    await expect(dlg.getByTestId('lw-layered-enabled')).toBeChecked()
    // The scope selector lists the container scope and shows its layer names.
    await dlg.getByTestId('lw-scope-select').selectOption('s2')
    await expect(dlg.getByTestId('lw-layer-name-0')).toHaveValue('Comfort')
    await dlg.getByTestId('lw-apply').click()
    await dlg.waitFor({ state: 'detached', timeout: 150_000 })
    await page.waitForTimeout(800)
    await fitView(page)

    mkdirSync(OUTPUT_DIR, { recursive: true })
    const base = path.join(OUTPUT_DIR, 'physical--scoped-layers')
    await page.screenshot({ path: `${base}.png` })
    const geo = await readDiagramGeometry(page)
    const parentOf = await readParentOf(page, projectId, viewId)
    const report = evaluateGeometry(geo, parentOf)
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 2))

    const rect = (suffix: string) =>
      geo.rects.find((r) => r.id.endsWith(`::${suffix}`))!
    const cy = (suffix: string) => (rect(suffix).minY + rect(suffix).maxY) / 2
    // Inside infotainmentEcu: Comfort band above Media band.
    expect(cy('climateControlSw')).toBeLessThan(cy('entertainmentSw'))
    const ecu = rect('infotainmentEcu')
    for (const id of ['climateControlSw', 'entertainmentSw']) {
      expect(rect(id).minX).toBeGreaterThanOrEqual(ecu.minX - 0.5)
      expect(rect(id).maxX).toBeLessThanOrEqual(ecu.maxX + 0.5)
      expect(rect(id).minY).toBeGreaterThanOrEqual(ecu.minY - 0.5)
      expect(rect(id).maxY).toBeLessThanOrEqual(ecu.maxY + 0.5)
    }
    // Root bands: Body above Control (ecu) above Drive.
    expect(cy('bodyShell')).toBeLessThan(cy('infotainmentEcu'))
    expect(cy('infotainmentEcu')).toBeLessThan(cy('wheelSet'))
    expect(report.overlapPairs, 'overlapping parts').toEqual([])
    expect(report.outsideParent, 'parts outside parent').toEqual([])
  })
})
