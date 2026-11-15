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
- `perform [action] ref;` where `ref` is `name`, `flow.step` or `Pkg::Fn::flow.step`. In an action or case it is a flow step (id `<owner>::<last segment>`); in a part it says the part performs that action (id `<part>::perform_<ref>`, so two performs never merge). The first segment is looked up through the owners and then the imports of the file, the rest by child name; the result is stored as `performTargetId`. A perform whose path does not resolve and whose last segment names no element is a warning with its line.
- Anonymous successions, messages and transitions get the ids `<owner>::succN`, `<owner>::msgN` and `<owner>::tN`, numbered from 1 within each owner (the use case, action, interaction or state def they sit in), not across the file. A flow therefore keeps its edge ids when another flow in the same file changes; layouts and visualization key on those ids. Named successions and the branch edges `if_<guard>_yes` / `if_<guard>_else` keep their names and do not use a number. Projects saved before this rule numbered across the file and can lose saved edge geometry for anonymous successions, messages and transitions once, the first time they are opened.
- `#Keyword dependency … from … to …` (prefix metadata on dependencies; shown as `«Keyword»`)
- `#Keyword part def …` / `#Keyword part …` / `#Keyword ref part …` (replaces `«part»` with `«Keyword»`)

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

- **Up:** one chain, picked per level by priority: 1. satisfy, refine /
  derive / objective dependencies and any dependency whose target is a
  requirement; 2. owner; 3. specialization family and typing; 4. allocate
  and include (perform goes here once it exists); 5. other dependencies
  (`#Command`, `#Mount`, `#extend`, …). Within a priority, model order
  wins. Candidates already in the chain are skipped; the chain ends when
  none is left. The others at a level are counted as `alternatives`.
- **Down:** every edge where the element is upper, breadth first; each
  element is expanded once, later occurrences are `repeated`. At most 8
  levels and 400 nodes; a node is `truncated` only if something not yet
  shown was cut off.

## Frontend layout

- Left sidebar: Views | Files tabs
- Center: canvas (diagram or text)
- Right sidebar: selected artifact details
- Header: project switcher, New / Save
