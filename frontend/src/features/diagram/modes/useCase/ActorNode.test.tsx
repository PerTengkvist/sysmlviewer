import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ActorNode / boundary-anchor Option visibility', () => {
  it('hides boundary anchors in tool-connect and shows them in tool-move-ports', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../../index.css'),
      'utf8',
    )
    expect(css).toMatch(
      /\.diagram-canvas\.tool-connect\s+\.boundary-anchor\s*\{[^}]*opacity:\s*0/s,
    )
    expect(css).toMatch(
      /\.diagram-canvas\.tool-move-ports\s+\.boundary-anchor\s*\{[^}]*opacity:\s*1/s,
    )
  })
})
