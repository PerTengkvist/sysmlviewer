import { describe, expect, it } from 'vitest'
import type { SemanticElement, VisualizationEdge, VisualizationNode } from '../../api'
import { applyViewFilters, type ViewFilterRow } from './viewFilters'

function el(
  partial: Partial<SemanticElement> & Pick<SemanticElement, 'id' | 'kind' | 'name'>,
): SemanticElement {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: null,
    ...partial,
  }
}

function node(id: string): VisualizationNode {
  return {
    artifactId: id,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    symbolRef: 'part',
    side: null,
    offset: null,
  }
}

function edge(id: string): VisualizationEdge {
  return {
    artifactId: id,
    routing: 'angular',
    waypoints: [],
  }
}

describe('applyViewFilters', () => {
  const engine = el({ id: 'Car::engine', kind: 'part', name: 'engine' })
  const wheel = el({ id: 'Car::wheel', kind: 'part', name: 'wheel' })
  const engineBlock = el({
    id: 'Car::engineBlock',
    kind: 'part',
    name: 'engineBlock',
  })
  const dep = el({
    id: 'Car::dep1',
    kind: 'dependency',
    name: 'uses',
    sourceId: 'Car::engine',
    targetId: 'Car::wheel',
  })
  const port = el({
    id: 'Car::engine::pwr',
    kind: 'port',
    name: 'pwr',
    parentId: 'Car::engine',
  })
  const engineWithPort = el({
    ...engine,
    children: ['Car::engine::pwr'],
  })

  it('does nothing when filters are empty or disabled', () => {
    const semantic = { [engine.id]: engine, [wheel.id]: wheel }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: {},
    }
    const disabled: ViewFilterRow[] = [
      { id: '1', kind: 'part', namePattern: '*', enabled: false },
    ]
    const out = applyViewFilters(semantic, visualization, disabled)
    expect(Object.keys(out.semantic).sort()).toEqual(
      Object.keys(semantic).sort(),
    )
    expect(Object.keys(out.visualization.nodes).sort()).toEqual(
      Object.keys(visualization.nodes).sort(),
    )
  })

  it('hides matching kind + exact name', () => {
    const semantic = { [engine.id]: engine, [wheel.id]: wheel }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: {},
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'part', namePattern: 'engine', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[engine.id]).toBeUndefined()
    expect(out.semantic[wheel.id]).toBeDefined()
    expect(out.visualization.nodes[engine.id]).toBeUndefined()
    expect(out.visualization.nodes[wheel.id]).toBeDefined()
  })

  it('hides via glob Eng*', () => {
    const eng = el({ id: 'Car::Engine', kind: 'part', name: 'Engine' })
    const engBlock = el({
      id: 'Car::EngineBlock',
      kind: 'part',
      name: 'EngineBlock',
    })
    const semantic = {
      [eng.id]: eng,
      [engBlock.id]: engBlock,
      [wheel.id]: wheel,
    }
    const visualization = {
      nodes: {
        [eng.id]: node(eng.id),
        [engBlock.id]: node(engBlock.id),
        [wheel.id]: node(wheel.id),
      },
      edges: {},
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'part', namePattern: 'Eng*', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[eng.id]).toBeUndefined()
    expect(out.semantic[engBlock.id]).toBeUndefined()
    expect(out.semantic[wheel.id]).toBeDefined()
  })

  it('hides a relation whose endpoint was hidden', () => {
    const semantic = {
      [engine.id]: engine,
      [wheel.id]: wheel,
      [dep.id]: dep,
    }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: { [dep.id]: edge(dep.id) },
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'part', namePattern: 'engine', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[dep.id]).toBeUndefined()
    expect(out.visualization.edges[dep.id]).toBeUndefined()
  })

  it('hides a relation that matches by kind + name', () => {
    const semantic = {
      [engine.id]: engine,
      [wheel.id]: wheel,
      [dep.id]: dep,
    }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: { [dep.id]: edge(dep.id) },
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'dependency', namePattern: 'uses', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[dep.id]).toBeUndefined()
    expect(out.semantic[engine.id]).toBeDefined()
    expect(out.visualization.edges[dep.id]).toBeUndefined()
  })

  it('hides ports by kind and removes them from parent children', () => {
    const semantic = {
      [engineWithPort.id]: engineWithPort,
      [port.id]: port,
    }
    const visualization = {
      nodes: {
        [engineWithPort.id]: node(engineWithPort.id),
        [port.id]: node(port.id),
      },
      edges: {},
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'port', namePattern: '*', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[port.id]).toBeUndefined()
    expect(out.semantic[engineWithPort.id]?.children).toEqual([])
    expect(out.visualization.nodes[port.id]).toBeUndefined()
  })

  it('hiding a part also hides its ports', () => {
    const semantic = {
      [engineWithPort.id]: engineWithPort,
      [port.id]: port,
    }
    const visualization = {
      nodes: {
        [engineWithPort.id]: node(engineWithPort.id),
        [port.id]: node(port.id),
      },
      edges: {},
    }
    const filters: ViewFilterRow[] = [
      { id: '1', kind: 'part', namePattern: 'engine', enabled: true },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[engineWithPort.id]).toBeUndefined()
    expect(out.semantic[port.id]).toBeUndefined()
  })

  it('matchField stereotype hides by metadata keyword glob', () => {
    const energyDep = el({
      id: 'dep-energy',
      kind: 'dependency',
      name: 'dep1',
      sourceId: engine.id,
      targetId: wheel.id,
      metadataKeywords: ['Energy'],
    })
    const mountDep = el({
      id: 'dep-mount',
      kind: 'dependency',
      name: 'dep2',
      sourceId: engine.id,
      targetId: wheel.id,
      metadataKeywords: ['Mount'],
    })
    const semantic = {
      [engine.id]: engine,
      [wheel.id]: wheel,
      [energyDep.id]: energyDep,
      [mountDep.id]: mountDep,
    }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: {
        [energyDep.id]: edge(energyDep.id),
        [mountDep.id]: edge(mountDep.id),
      },
    }
    const filters: ViewFilterRow[] = [
      {
        id: '1',
        kind: 'dependency',
        matchField: 'stereotype',
        namePattern: 'Ener*',
        enabled: true,
      },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[energyDep.id]).toBeUndefined()
    expect(out.semantic[mountDep.id]).toBeDefined()
  })

  it('matchField any matches name or stereotype', () => {
    const energyDep = el({
      id: 'dep-energy',
      kind: 'dependency',
      name: 'dep1',
      sourceId: engine.id,
      targetId: wheel.id,
      metadataKeywords: ['Energy'],
    })
    const namedDep = el({
      id: 'dep-named',
      kind: 'dependency',
      name: 'EnergyLink',
      sourceId: engine.id,
      targetId: wheel.id,
      metadataKeywords: [],
    })
    const semantic = {
      [engine.id]: engine,
      [wheel.id]: wheel,
      [energyDep.id]: energyDep,
      [namedDep.id]: namedDep,
    }
    const visualization = {
      nodes: { [engine.id]: node(engine.id), [wheel.id]: node(wheel.id) },
      edges: {
        [energyDep.id]: edge(energyDep.id),
        [namedDep.id]: edge(namedDep.id),
      },
    }
    const filters: ViewFilterRow[] = [
      {
        id: '1',
        kind: 'dependency',
        matchField: 'any',
        namePattern: 'Energy*',
        enabled: true,
      },
    ]
    const out = applyViewFilters(semantic, visualization, filters)
    expect(out.semantic[energyDep.id]).toBeUndefined()
    expect(out.semantic[namedDep.id]).toBeUndefined()
  })
})
