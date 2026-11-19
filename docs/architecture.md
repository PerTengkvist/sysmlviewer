# SysML Viewer — Architecture (Alpha)

## Stack

- **Backend:** FastAPI, hexagonal (domain / ports / adapters)
- **Frontend:** React + Vite + TypeScript + React Flow (built to `frontend/dist/`)
- **Runtime (prod):** single uvicorn process serves `/` (static UI) and `/api/*` (JSON API)
- **Persistence:** single workspace folder (`project.json` + `state.json` + `.sysml` at folder root); MongoDB adapter stubbed

## Hexagonal layout

```
backend/src/
  domain/           # Project, Artifact, Visualization, merge rules, sheet
  application/      # Use-case services
  ports/            # ProjectRepository, SysmlParser protocols
  adapters/
    api/            # FastAPI routes + session; composite app mounts API at /api
    persistence/    # workspace_repo (default), json_repo (legacy), mongo stub
    parser/         # subset SysML textual parser
  cli.py            # -f / -p startup; sets SYSMLVIEWER_STATIC_DIR
```

## HTTP layout (production)

- `GET /` — static SPA from `frontend/dist/` (when present)
- `GET/POST /api/...` — JSON API (session, projects, files, views, …)
- OpenAPI: `/api/docs`

Launchers: [`sysmlviewer.sh`](../sysmlviewer.sh) / [`sysmlviewer.bat`](../sysmlviewer.bat) — default prod on `:5174` (auto-builds `frontend/dist/` if missing); `--dev` runs Vite `:5173` with `/api` proxied to backend. `frontend/dist/` is gitignored — CI builds it as an artifact.

## Domain model

### Project

- `id`, `name`, `createdAt`, `updatedAt`
- `files`: list of SysML file records (`id`, `name`, `content`, `warnings`)
- `semantic`: map of artifact id → SemanticElement
- `visualization`: map of artifact id → VisualizationObject (+ edges) — style, port side/offset, edge routing/waypoints
- `viewLayouts` (in-memory / API): map of view id → node/edge geometry overlay; **on disk** as `views/<name>.json` (not inside `state.json`)
- `views`: list of diagram views (auto-generated per package/part)

### SemanticElement

- `id` — qualified name (`Package::Part::port`)
- `kind` — `package` | `part` | `port` | `connection` | `view` | `attribute` | `interaction` | `lifeline` | `message` | `state` | `transition` | `action` | `succession`
- `name`, `parentId`
- `typeRef` (optional), `sourceId` / `targetId` for connections/messages/transitions/successions
- `exposeRef` — for view elements
- `children` — child artifact ids
- `fileId` — originating file

Logical service/control interfaces follow an S_entity / U_entity naming policy (`sci`/`scp`/`rcp` and siblings). See [interface_naming.md](interface_naming.md).

### Diagram modes

`GET /views/{id}` sets `diagramMode` from the view's `typeRef`:

| typeRef | diagramMode |
|---------|-------------|
| GeneralView / null | `whitebox` or `structure` by root kind |
| SequenceView | `sequence` |
| StateTransitionView | `state` |
| ActionFlowView | `actionFlow` |
| TreeView | `tree` |

Frontend `DiagramCanvas` dispatches to mode-specific React Flow builders under `features/diagram/modes/`.

An `actionFlow` payload also has `performers: {actionId: [partId]}`: the parts that perform each step through `perform flow.step;` (`domain/perform.py`). Those parts are in `semantic` for their names but are not drawn. It also has `hasViewLayout`: true when the positions come from the view's own `views/<name>.json`, false when they are project defaults; the flow direction (TD/LR) is read from the positions only in the first case.

### VisualizationObject (node)

- `artifactId`
- `x`, `y`, `width`, `height`
- `symbolRef` (default or SVG id)
- For ports: `side`, `offset` (0–1 along edge)

### VisualizationEdge

- `artifactId` (connection)
- `routing` — `angular` | `direct` | `spline`
- `waypoints` — list of `{x, y}` reference points

### Merge rule

`merge_visualization(semantic, existing_viz)`:

1. For each semantic element: if viz exists for `artifactId`, keep geometry; update kind/metadata.
2. Else create default layout.
3. Remove viz entries with no matching semantic element.
4. Same for edges keyed by connection artifact ids.

### Failure impact (toolbox)

`scripts/failure_impact.py` answers "what does it do to the functions, use cases and requirements if this part fails?". The logic is pure domain code in `backend/src/domain/failure/` (`model`, `extract`, `propagate`, `scenarios`, `report`); it imports no adapter, FastAPI, JSON or YAML (`tests/test_domain_purity.py` checks this). The script only parses the project through the parser adapter and prints. No API endpoint, no stored data and no viewer change: the model is read, never written.

**Layers.** `extract.build_impact_graph(semantic)` derives the roles from relations, not names:

| Layer | Definition |
|---|---|
| physical part | part usage that is the source of `#implements`, or has an ancestor that is. A `part def` that implements makes its parts physical but adds no input to the logical part (the whole is not a common cause of it) |
| logical part | target of `#implements` or `allocate`, or the source of `satisfy` |
| function node | source of an `allocate` to a logical part |
| function | owner of a function node |
| use case | target of `#refine` from a function or function node, source of `objective`, or an end of `include` |
| requirement | target of `objective` from a use case, or of `satisfy` from a logical part |

A function dependency is a `dependency` between two functions with a metadata keyword that is not a trace keyword (`refine`, `derive`, `objective`, `implements`, `extend`), for example `#Energy`. `#Soft` makes it soft; write it **after** the keyword (`#Energy #Soft dependency …`), because the first keyword (`metadataKeywords[0]`) is the label shown in the dependency tree and in views, and `#Soft` first would change it. The engine accepts either order.

**Rules.** Capability `c` is in [0, 1]: 1 is OK, 0 is LOST, otherwise DEGRADED. A node's value is the minimum of its own failure, its owner part (containment, downwards only), and all its inputs: implementers of a logical part, allocations of a function node, nodes and hard dependencies of a function, functions and nodes that refine a use case, included use cases, and use cases (`objective`) and logical parts (`satisfy`) of a requirement. A soft dependency contributes `max(c, 0.5)`. The minimum is evaluated as a fixpoint, so dependency cycles terminate; nodes on a cycle get the flag `cycle`, but only while their capability is below 1 (a cycle in a model with no failure carries no flags). A requirement is at risk when `c < 1`. `erroneous` is treated as loss and flagged `erroneous_as_loss`. Each node keeps the input that limited it (`limited_by`; ties go to the input closest to a failed part, then model order, so a chain through a cycle still reaches the failure), which gives the causal chain back to the failed part. Flags (`pool_at_minimum`, `redundancy_exhausted`, `erroneous_as_loss`) spread downstream; `common_cause` marks a failure whose part and its children implement at least two logical parts.

**Modelling conventions** (kept in the SysML model). The keywords come from the library package `FailureModel`, whose canonical file is `libraries/failure_model.sysml` (see `libraries/README.md`). A project only reads `.sysml` files below its own folder, so a project uses the library by **copying** the file into its folder and adding `private import FailureModel::*;`. The import names the package, so the folder inside the project does not matter. Electric Car keeps its copy in `examples/electric_car/failure_model/`; `test_libraries.py` keeps it identical to the canonical file. If the file is missing, the import gives `import 'FailureModel::*' — package not found`, filed under the importing file, and the toolbox scripts stop unless `--allow-warnings` is given.

- A part usage with a multiplicity (`part x[8]`) is a group of instances. With no keyword all instances are needed (and-gate).
- `#Pool`: capacities add up. `c` is surviving capacity divided by total capacity, and the pool is LOST when the surviving capacity is below `required`.
- `#Redundant`: k of n, `c` is the k-th best instance. With exactly k survivors `redundancy_exhausted` is set.
- Capacity per instance is the one numeric attribute (own or inherited) whose name starts with `capacity` (`capacityKWh = 7.5`); without one every instance counts as 1.
- `required` is read from `<usage>Required` in the owner (`brakeCircuitsRequired = 1`), otherwise from `required` in the owner when it holds exactly one `#Pool`/`#Redundant` usage (`batteryPack::required`). A `#Redundant` without it uses 1 and warns; a `#Pool` without it uses 0. Extraction also warns when `required` is not numeric, when it exceeds the pool's total capacity or the number of redundant instances, when a usage has several `capacity*` attributes, when only a `part def` implements a logical part that has function nodes (no usage can fail it), and when a dependency touches a function node (only function-to-function dependencies are supported).
- A multiplicity that cannot be evaluated (`*`, `0..*`) warns and the usage counts as one instance. Values in `@Meta { ... }` bodies are not parsed, hence the naming conventions.

**Command line.** `--fail <name>:<kind>[:<fraction>][:<count>]` (repeatable) or `--spof` (every physical part lost in turn, one instance of a group), `--format text|markdown|json`. Names are resolved first with `NameResolver`, then as a suffix of whole segments (`.` counts as `::`); an ambiguous name lists its candidates and an unknown name suggests close matches (exit 2). Parser warnings stop the run (exit 1) unless `--allow-warnings` is given. The JSON output has `failures`, `nodes` (per id: `layer`, `capability`, `status`, `limitedBy`, `flags`, `chain`), `functions`, `useCases`, `requirements` (the ones that are not OK, LOST first) and `warnings`.

## Parser subset

Supported textual constructs:

- `package Name { ... }`
- `part def Name { ... }` / `part name : Type;`
- `port name;` / `port name : Type;`
- `connection name connect A.p to B.q;` / `connect A.p to B.q;`
- `attribute` / `attribute def`
- `view name : GeneralView|SequenceView|StateTransitionView|ActionFlowView|TreeView { expose … }` is a diagram; `view def Name :> GeneralView { … }` defines a kind of view, and a usage typed by it takes its diagram type, `expose` and filters (`domain/view_usage.py`). A `view def` that no usage refers to is still shown as a diagram, with a warning.
- `interaction def` / `lifeline` / `message … from … to …` / `then message …`
- `state def` / nested `state` / `transition … from … to …`
- `action def` / nested `action` / `succession … first … then …` / `first start; then a; then if g then b else c; then done;`
- `abstract part def …` / `abstract action def …` (`isAbstract`, written only when true). `part def` sets `isDefinition` (also only when true), so an abstract definition shows «abstract part def» and an abstract usage «abstract part»; concrete parts keep «part».
- `perform [action] ref;` where `ref` is `name`, `flow.step` or `Pkg::Fn::flow.step`. In an action or case it is a flow step (id `<owner>::<last segment>`); in a part it says the part performs that action (id `<part>::perform_<ref>`, so two performs never merge). The reference is resolved from its owner with the rules in "Name resolution and imports" (so an import only counts in the namespace it is written in); the result is stored as `performTargetId`. A perform whose path does not resolve and whose last segment names no element is a warning with its line.
- Anonymous successions, messages and transitions get the ids `<owner>::succN`, `<owner>::msgN` and `<owner>::tN`, numbered from 1 within each owner (the use case, action, interaction or state def they sit in), not across the file. A flow therefore keeps its edge ids when another flow in the same file changes; layouts and visualization key on those ids. Named successions and the branch edges `if_<guard>_yes` / `if_<guard>_else` keep their names and do not use a number. Projects saved before this rule numbered across the file and can lose saved edge geometry for anonymous successions, messages and transitions once, the first time they are opened.
- `#Keyword dependency … from … to …` (prefix metadata on dependencies; shown as `«Keyword»`)
- `#Keyword part def …` / `#Keyword part …` / `#Keyword ref part …` (replaces `«part»` with `«Keyword»`)

### Name resolution and imports

References between elements are resolved by `domain/name_resolution.py` (`NameResolver`) after all files are merged and before inheritance, so a reference does not depend on file or declaration order.

- **Lookup order** for a name written in namespace `N`: own members of `N` (and, for a typed part, the members of its definition), then the members `N`'s imports make visible, then the same two steps in `N`'s owner, and so on out to the root. The root holds the top-level elements of every file, then the file's own file-level imports. Own members shadow imported ones on the same level; an inner level always wins over an outer one.
- **Import forms:** `import X::Name;` (one member), `import X::*;` (members of `X`), `import X::**;` (`X` and everything below it, at any depth) and `import X::*::**;` (everything below `X`, not `X`). An import applies to the namespace it is written in (and the namespaces inside it); a file-level import applies to its own file only.
- **Re-export:** `public import` (also a bare `import`) makes the imported names visible members of the importing namespace for anyone who imports or qualifies through it, transitively. `private import` does not.
- **Qualified names** `A::B::c` look `A` up as above and then follow members down. There is no backtracking: if `A` is found but has no `B`, the name is unresolved even when another `A::B` exists further out.
- **Feature chains** `engine.powerIn`: the head is resolved by name, the tail follows ownership. When the tail is only created by inheritance (`engine : Engine` gets `powerIn` from `Engine`), the id `<head>::powerIn` is kept and checked after inheritance.
- **Unresolved ends** keep a value that names no element: the reference as written, qualified by its scope (`B::q`), or `?ref` (the scope is dropped) if even that is taken, with a numeric suffix if needed; an end never lands on another element. An ambiguous qualified tail (`Lib::x` where `Lib` re-exports two `x`) is reported as ambiguous with its candidates. A reference only writes the ends of an element from its own file (when two files declare the same id, the one that won the merge is not touched by the other's references). A `perform X;` step is a stub that only references `X`, so it declares no name; a declared action that merely gets the `perform` keyword stays a member.
- **Typed usages:** the parser stores `typeTargetId` on every typed usage (part, port, attribute, action, use case, requirement, …): the definition of the same kind that `typeRef` resolves to. A definition is an element declared with `def` (`isDefinition`, now set for every kind that has a `def` form) or one that is specialized. A simple type name is looked up outwards like any name, but a candidate that is not such a definition (an untyped usage, the usage itself as in `port sP1 : sP1`) does not stop the search. The dependency tree reads `typeTargetId` and never matches by name. The field is set when parsing; elements added through the editor API get it at the next parse (sources are re-read on load).
- **Type warnings** (in the file and on the line of the usage): `line N: type reference 'T' is ambiguous: … (in 'id')` for any kind, and `line N: type 'T' is not visible from 'id' (Other::T exists; add an import or qualify the name)` when `T` is not reachable but a definition of that kind with that name exists elsewhere in the project (project parses only). The older "could not be resolved" warning is unchanged except that it skips usages that did get a `typeTargetId`.
- **Warnings** (in the file that holds the reference, with its line): `line N: <kind> <role> not found: <ref> (in '<relation id>')`, and `line N: <kind> <role> '<ref>' is ambiguous: <id> (import line M), ... (in '<relation id>')` when two imports on the same level give different elements. An unresolved or ambiguous end is never pointed at another element; it keeps the reference as written, qualified by its scope (`App::nope`). The old fallback "the only element with this name in the file" is gone.
- **Covered:** the ends of `dependency` (including `#kw` forms and `objective`), `allocate`, `bind`, `flow`, `connection`, `interface … connect`, `satisfy` and the target of `include`. Successions, messages and transitions inside a flow are resolved locally. The targets of specialization, subsetting and redefinition (`:>`, `:>>`) and `perform` use the same resolution (an unresolved `:>` target stays silent). Type references (`: T`) use the same resolution for every kind, from the namespace the usage is written in (own, enclosing, imported); only a definition of the same kind counts (`isDefinition`, or specialized), and a candidate that is not one does not stop a simple name's lookup. The `typeTargetId` it produces is described under "Typed usages", the warnings under "Type warnings" (ambiguous, or not visible although a definition exists elsewhere). A `:>` / `:>>` target never resolves to its own declaration (`part def Engine :> Engine` points at the imported `Engine`).
- The parse result's `imports[]` entries carry `ownerId`, the namespace the import is written in (`null` for the file's root).

Unknown constructs emit warnings and are skipped when possible.

## API (alpha)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/session` | Current workspace + project (or empty) |
| POST | `/session/create` | Create `project.json` in folder and open |
| POST | `/session/open` | Open folder or project file |
| POST | `/projects` | Create in open workspace (or with `folder`) |
| GET | `/projects` | List (open workspace only) |
| GET | `/projects/{id}` | Get project |
| PUT | `/projects/{id}` | Save/update project |
| POST | `/projects/{id}/files` | Add SysML by relative `{ path }` (read/create on disk) |
| POST | `/projects/{id}/files/refresh/{fileId}` | Re-read from disk and re-parse (`fileId` may contain `/`) |
| PATCH/DELETE | `/projects/{id}/files/item/{fileId}` | Rename/delete file (`fileId` may contain `/`) |
| PATCH | `/projects/{id}/visualization` | Update layout; optional `viewId` writes geometry to `views/*.json` |
| PUT/DELETE | `/projects/{id}/sheet/title-block` | Drawing title block |
| PUT/DELETE | `/projects/{id}/sheet/frame` | Drawing frame (A4/A3) |
| GET | `/projects/{id}/views/{viewId}` | Get view payload |
| POST | `/projects/{id}/views/{viewId}/export` | Export open view layout JSON (Save As or `{ path }`) |
| GET | `/projects/{id}/dependency-tree/{elementId}` | `{root, up, down, truncated}`: one chain up to the more abstract element, a labelled tree down (`domain/dependency_tree.py`) |

### Dependency tree

`GET /projects/{id}/dependency-tree/{elementId}` (404 for an unknown project
or element). Every edge runs from an upper, more abstract element to a lower
one:

| Relation | Upper | Lower | Label |
|---|---|---|---|
| satisfy | requirement (target) | source | `satisfy` |
| dependency | target | source | keyword, else `dependency` |
| specialization / subsetting / redefinition | target | source | kind |
| typing `: T` | definition | usage | `typed by` |
| include | including use case | included | `include` |
| allocation | source | target | `allocate` |
| ownership (owner not a package) | owner | part, requirement, use case, actor, action | `owned by` / `owns` |

Connections, interfaces, bindings, flows, successions, transitions and
messages are not in the tree. A relation ending at a port counts for the
part that owns it.

- **Up:** one chain, picked per level by priority: 1. trace: satisfy,
  refine / derive / objective / implements dependencies (a function's or
  functional entity's `#refine` to a use case included) and any dependency
  whose target is a requirement; 2. allocate; 3. owner; 4. specialization
  family and typing; 5. include (perform goes here once it exists);
  6. other dependencies (`#Command`, `#Mount`, `#extend`, …). Within a
  priority, model order wins. So a physical part climbs through
  `#implements` to the logical part it realizes, and a logical part through
  the functional entity allocated to it to the use case that entity refines
  and the requirement that use case pursues, unless the part satisfies a
  requirement directly. Candidates already in the chain are skipped; the
  chain ends when none is left. The others at a level are counted as `alternatives`.
- **Down:** every edge where the element is upper, breadth first; each
  element is expanded once, later occurrences are `repeated`. At most 8
  levels and 400 nodes; a node is `truncated` only if something not yet
  shown was cut off.

## Frontend layout

- Left sidebar: Views | Files tabs
- Center: canvas (diagram or text)
- Right sidebar: selected artifact details
- Header: project switcher, New / Save
