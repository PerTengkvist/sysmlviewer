import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UseCaseFlowParamsPanel } from './UseCaseFlowParamsPanel'
import type { UseCaseFlowParams } from './buildUseCaseFlow'

const params: UseCaseFlowParams = {
  title: 'StartVehicle',
  actors: ['Driver'],
  subjects: [],
  objective: 'REQ-PERF-06 PowerModes',
  requirements: [
    { id: 'R::PowerModes', label: 'objective', name: 'REQ-PERF-06 PowerModes' },
    { id: 'R::DriveToDest', label: 'refine', name: 'US-DRIVE-01 DriveToDestination' },
  ],
}

describe('UseCaseFlowParamsPanel', () => {
  it('lists traced requirements with their relation', () => {
    const html = renderToStaticMarkup(
      <UseCaseFlowParamsPanel params={params} actionLinks={[]} semantic={{}} />,
    )
    expect(html).toContain('<h3>Requirements</h3>')
    expect(html).toContain('«objective»')
    expect(html).toContain('REQ-PERF-06 PowerModes')
    expect(html).toContain('«refine»')
    expect(html).toContain('US-DRIVE-01 DriveToDestination')
  })

  it('makes requirements clickable when the dialog can open them', () => {
    const html = renderToStaticMarkup(
      <UseCaseFlowParamsPanel
        params={params}
        actionLinks={[]}
        semantic={{}}
        onOpenElement={() => {}}
      />,
    )
    expect(html).toContain('data-requirement-id="R::PowerModes"')
    expect(html).toMatch(/<button[^>]*data-requirement-id="R::DriveToDest"/)
  })

  it('omits the section when nothing is traced', () => {
    const html = renderToStaticMarkup(
      <UseCaseFlowParamsPanel
        params={{ ...params, requirements: [] }}
        actionLinks={[]}
        semantic={{}}
      />,
    )
    expect(html).not.toContain('Requirements')
  })
})
