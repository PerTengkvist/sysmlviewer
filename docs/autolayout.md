# AutoLayout

Structure (interconnection) diagrams are placed in the browser with
[elkjs](https://github.com/kieler/elkjs) plus a few in-house passes. Everything
lives under `frontend/src/features/diagram/layout/`. Connections are always
routed afterwards by the in-house orthogonal A\* router
(`connectionRouting.ts`).

## Pipelines

The AutoLayout dialog (toolbar → *AutoLayout*) has a Simple and an Advanced
mode. Simple maps onto a subset of the Advanced pipelines
(`placementPipelines.ts`):

| Pipeline (Advanced)      | Simple name   | Placement                                   |
|--------------------------|---------------|---------------------------------------------|
| `favour-grid`            | Favour grid   | Composition rules; matrix at N ≥ 4          |
| `clustered`              | Clustered     | Composition rules; packed core at N ≥ 4     |
| `connection-aware`       | Stress        | ELK stress                                   |
| `flow-layered`           | Layered       | ELK layered on part↔part edges              |
| `organic-force`          | –             | ELK force                                    |
| `compact-pack`           | –             | ELK rectpacking                              |
| `custom`                 | –             | Per nest level, chosen from weights          |
| `hierarchic`             | –             | **yEd-style Sugiyama** (see below)           |

### Clustered (packed core)

`clusteredPack.ts`. For N ≥ 4 siblings with at least one connection:

1. **Core**: `coreSize = clamp(round(N/3), 1, 4)` parts, chosen greedily
   (hub first, then the neighbour with most edges into the core). The core
   is placed with the N ≤ 3 composition rules (centre / stack / onion).
2. **Rings**: the remaining parts are packed in rectangular rings around the
   core. Each part sits on the ring side facing the core members it connects
   to, at the projection of that anchor; rows are packed so nothing overlaps.
3. **Channels**: the gap between rings is
   `max(minChannel, ceil(crossing/4) × separation + 16)` so the connections
   crossing the channel have room.

Without connections the matrix placement is used.

### Hierarchic (yEd-style Sugiyama)

`hierarchicLayout.ts`, Advanced only. Mapping onto the five phases:

| Phase                      | How                                                             |
|----------------------------|-----------------------------------------------------------------|
| 1 Cycle breaking           | `elk.layered.cycleBreaking.strategy` (greedy / depth-first / model order; interactive when incremental) |
| 2 Layer assignment         | `elk.layered.layering.strategy` (network simplex default); layers from Layout Rules become ELK partitions |
| 3 Crossing minimisation    | layer sweep with `thoroughness`; semi-interactive when hints or incremental |
| 4 Node placement           | Brandes–Köpf (default), network simplex, linear segments        |
| 5 Edge routing             | ELK orthogonal (for scoring); final routes by the in-house router |

What is added around ELK:

- **Ports take part in placement**: edges are port↔port, not part↔part.
- **Port candidates**: each port has a set of allowed sides (IO mode: inputs
  face against the direction, outputs along it; ports wired to the boundary
  inherit its side; otherwise all four). The initial side follows the flow
  (source ports along the direction, target ports against it).
- **Iteration**: after each ELK run every port is flipped toward the
  barycentre of its peers (within its candidates); the run with the best
  `layoutQuality` score (overlaps, edges through parts, crossings, bends,
  length) is kept. `maxIterations` bounds the number of ELK runs.
- **Nested groups**: the full part tree is one compound ELK graph
  (`hierarchyHandling: INCLUDE_CHILDREN`), so nested containers are placed
  among their siblings and their children inside them.
- **Incremental**: current positions are passed as `elk.position` with
  interactive layering / cycle breaking and semi-interactive crossing
  minimisation, so the existing arrangement is preserved while new parts are
  fitted in.
- **Layout Rules as hard constraints** (`layoutConstraints.ts`):
  - `belong to` layer → `elk.partitioning.partition` on top-level parts;
  - above/below (top-down) or left/right (left-right) → invisible
    high-priority constraint edges (`elk.layered.priority.direction`);
  - rules perpendicular to the direction → position hints with
    semi-interactive crossing minimisation, verified by a post-pass that
    swaps violating pairs;
  - when layered layout is enabled the top-level parts are snapped into
    exact bands (`layerBands.ts`).

## Place by: connections, bindings, relations

The *Place by* checkboxes decide which edges pull nodes together
(`layoutEdgeKinds.ts`):

- **Connections** and **Bindings**: port-to-port links, as before.
- **Relations**: dependencies (refine, derive, objective, …), satisfy,
  include, allocation and specialization. They are drawn node to node, so
  they reach placement as edges without handles; every pipeline treats them as
  plain node links.

Placement and routing are separate. Connections and bindings are routed
again whichever boxes are ticked; relations are never routed (they keep their
own drawing). Requirements, use cases and actors are placed like parts
(`layoutNodes.ts`). In a diagram without an enclosing part (a package or
requirement diagram), favour-grid and clustered arrange the top level too.

The choice is saved per view (`autoLayoutEdgeKinds` in `views/<View>.json`).
A view without one starts with Connections, Bindings as the *include bindings
in routing* setting says, and Relations when the diagram has no connections.
For a traceability diagram, *Advanced → hierarchic* with Relations gives
layers: user stories, requirements, then the requirements they refine.

## Redraw: Relations

*Redraw: Connections* reroutes port-to-port connections and leaves relations
alone. *Redraw: Relations* (every GeneralView) does the opposite: it keeps all
nodes where they are and redraws each relation as a straight line from where
the centre-to-centre line leaves one node to where it enters the other
(`redrawStructureRelations.ts`). Waypoints are dropped. A part end gets its
own handle at that point; a requirement or use case gets an extra anchor
`rel:<relation id>` beside its four default anchors. The result is saved in
the view and Undo puts the previous attachments back. Run it after moving
nodes, or after AutoLayout with *Relations* ticked.

## Port placement modes

The *Port placement* mode in the AutoLayout dialog is a hard contract that
**every** placement pipeline follows (`allowedPortSides` in
`autoLayoutOptions.ts`): the mode, together with the port's flow role
(`…In` / `…Out` names, otherwise connection direction), yields the set of
sides a port may sit on. It does not depend on the layout direction, so
*Inputs left, outputs right* keeps ports on the left and right even in a
top-down Hierarchic run.

| Mode                               | in-port             | out-port  | unknown role |
|------------------------------------|---------------------|-----------|--------------|
| Inputs left, outputs right         | left                | right     | left, right  |
| Optimized placement                | all four            | all four  | all four     |
| Optimized placement – no top       | left, right, bottom | same      | same         |
| Optimized placement – no top/bottom| left, right         | same      | same         |

How it is enforced:

- Hierarchic: the allowed sides are the port candidates; the ELK port
  constraint is forced to `FIXED_SIDE` (or `FIXED_ORDER`) unless the mode is
  plain *Optimized*; the side written back is the pipeline's own, ELK only
  supplies the offset; a final guard clamps any leak.
- Other pipelines (`elkStructureLayout.ts`): `seedPortSide` picks the best
  allowed side from the peer vector (`portSideChoice.ts`), ELK ports are
  `FIXED_SIDE` unless plain *Optimized*, and the same final guard runs.
- Boundary ports are never moved by the mode.
- `portPlacementContract.test.ts` runs every pipeline × mode and asserts the
  contract; the Playwright suite reports `portSides` and
  `portSideViolations` per case.

## Layout Rules and layered layout

Toolbar → *Layout Rules*. The dialog has one **tab per scope**. **+** adds a
scope and asks what it arranges; **×** on a tab removes that scope.

A scope targets one of:

- **Whole diagram**: the top level (the boundary's direct children in a
  whitebox view, the top-level elements in a package view);
- a **package** in the diagram;
- a **part with children** in the diagram.

Each target can have one scope. A scope's rules and layers arrange only the
target's **direct children**; a rule in one scope never moves elements of
another, even when the names match.

Per tab:

- **Enable**: off keeps the scope but AutoLayout and *Apply* ignore it.
- **Layers**: *Use layers*, *Direction* (top-down, bottom-up, left-right,
  right-left), *Layers* (count) and a name per layer (defaults to the
  ordinal).
- **Rules**: the relative placement rules, plus **belong to** with peer
  artefact `layer` and one of this scope's layer names.

Behaviour:

- Children without a `belong to` rule are auto-assigned from their
  connections: after their sources, before their targets (rounded
  barycentre), last layer when unconnected. A side-by-side rule (e.g. *A to
  the left of B*) pulls an unassigned peer into the same layer.
- Geometry: each band is twice as thick as its largest part (parts take
  50 %), parts are centred in the band and every row/column is centred on a
  common axis.
- *Apply* runs the Hierarchic pipeline with every enabled scope as
  constraints when one of them uses layers; otherwise the relative-rule
  solver (`layoutWizard.ts`) places each scope's children.
- Conflicts are checked per scope and the tab with the conflict is opened:
  unknown layer name, one part in two layers, side-by-side rules across
  layers, order rules contradicting explicit layers, cycles and empty peers.
- Hierarchic lays out a scoped container with layers first as its own run,
  then uses it as a fixed-size leaf in the outer run. Containers without a
  scope are laid out by ELK inside the compound graph.
- Text fields (names, patterns, layer names) are saved on blur; the other
  controls save at once.

Code: `layoutScopes.ts` (targets, scope list, per-scope constraints, conflicts
and solver) runs the engine in `layout/layoutConstraints.ts` once per scope.

Persistence: `layoutScopes = [{ id, target, enabled, layering: { enabled,
direction, layers }, rules }]` per view in `views/<name>.json`
(`PATCH /api/projects/{id}/visualization`). Older files with `layoutRules` +
`layeredLayout` are migrated on read: the `*` scope becomes *Whole diagram*,
a name-pattern scope targets the first container in the view with a matching
name, and a `belong to` rule moves to the scope that has its layer.

## E2E layout evaluation (Playwright)

```bash
cd frontend
npm run e2e                 # all cases → e2e/output/latest/
npm run e2e:baseline        # → e2e/output/baseline/
npm run e2e -- --grep "car-logical"
```

`playwright.config.ts` starts `e2e/server.mjs`, which builds `dist/` if it is
missing, copies `examples/electric_car` and `examples/diagrams` to a temp
folder (so the repo examples are never written to) and serves the production
bundle through the backend on port 5184.

`e2e/autolayout.spec.ts` runs every view × algorithm, saves a screenshot and
a metrics JSON (`layoutQuality.ts`: overlaps, parts outside their parent,
edges through parts, crossings, bends, bounding area) and asserts no
overlaps and no part outside its parent. Compare `e2e/output/latest` with
`e2e/output/baseline` when changing a layout algorithm.
