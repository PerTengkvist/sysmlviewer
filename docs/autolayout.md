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

Toolbar → *Layout Rules*. The dialog has a **Layered layout** section above
the rule table:

- *Enable*, *Direction* (top-down, bottom-up, left-right, right-left),
  *Layers* (count) and a name per layer (defaults to the ordinal).
- Rules gain the placement **belong to** with peer artefact `layer` and the
  layer name as peer name.
- Parts without a `belong to` rule are auto-assigned from their connections:
  after their sources, before their targets (rounded barycentre), last layer
  when unconnected. A side-by-side rule (e.g. *A to the left of B*) pulls an
  unassigned peer into the same layer.
- Geometry: each band is twice as thick as its largest part (parts take
  50 %), parts are centred in the band and every row/column is centred on a
  common axis.
- *Apply* with layered layout enabled runs the Hierarchic pipeline with the
  rules as constraints. With it disabled the original relative-rule solver
  (`layoutWizard.ts`) is used.
- Conflicts reported: unknown layer name, one part in two layers, side-by-side
  rules across layers, order rules contradicting explicit layers, plus the
  existing cycle/empty-peer checks.

### Scopes: layers inside a part

A layered layout consists of *scopes*. The root scope (container pattern
`*`, "Whole diagram") arranges the boundary's direct children. Any other
scope names a container by pattern (e.g. `infotainmentEcu` or `*Ecu`) and
arranges the children of every matching container with its own direction
and layers.

- `layeredLayout = { enabled, scopes: [{ id, scopePattern, direction, layers }] }`.
  The earlier single-scope shape is migrated to a root scope on read.
- A `belong to` rule resolves the layer name in the scope of the subject's
  **parent**: `climateControlSw belong to Comfort` looks for `Comfort` in the
  scope matching `infotainmentEcu`. The dialog's layer select shows the right
  scope's layers per row.
- Auto-assignment, order rules and precedence are computed per container
  (`ScopeConstraints` in `layoutConstraints.ts`). Rules pairing parts of
  different containers are reported as conflicts.
- Hierarchic lays out a scoped container first as its own run (the container
  is the boundary, its scope is the root scope, nested scopes follow), then
  uses it as a fixed-size leaf in the outer run. Edges into the container
  attach to the container itself in that outer run.
- Containers without a matching scope are laid out by ELK inside the
  compound graph as before.

Persistence: `layeredLayout` and `layoutRules` are stored per view in
`views/<name>.json` (`PATCH /api/projects/{id}/visualization`).

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
