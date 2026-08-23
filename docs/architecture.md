# SysML Viewer — Architecture (Alpha)

## Stack

- **Backend:** FastAPI, hexagonal (domain / ports / adapters)
- **Frontend:** React + Vite + TypeScript + React Flow
- **Persistence:** single workspace folder (`project.json` + `state.json` + `.sysml` at folder root); MongoDB adapter stubbed

## Hexagonal layout

```
backend/src/
  domain/           # Project, Artifact, Visualization, merge rules, sheet
  application/      # Use-case services
  ports/            # ProjectRepository, SysmlParser protocols
  adapters/
    api/            # FastAPI routes + session
    persistence/    # workspace_repo (default), json_repo (legacy), mongo stub
    parser/         # subset SysML textual parser
  cli.py            # -f / -p startup
```

## Domain model

### Project

- `id`, `name`, `createdAt`, `updatedAt`
- `files`: list of SysML file records (`id`, `name`, `content`, `warnings`)
- `semantic`: map of artifact id → SemanticElement
- `visualization`: map of artifact id → VisualizationObject (+ edges) — style, port side/offset, edge routing/waypoints
- `viewLayouts`: map of view id → `{ nodes: { artifactId → { x, y, width, height } } }` — per-view geometry overlay
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
- `view def Name : GeneralView|SequenceView|StateTransitionView|ActionFlowView|TreeView { expose … }`
- `interaction def` / `lifeline` / `message … from … to …` / `then message …`
- `state def` / nested `state` / `transition … from … to …`
- `action def` / nested `action` / `succession … first … then …`

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
| PATCH | `/projects/{id}/visualization` | Update layout; optional `viewId` writes node x/y/width/height to `viewLayouts` |
| PUT/DELETE | `/projects/{id}/sheet/title-block` | Drawing title block |
| PUT/DELETE | `/projects/{id}/sheet/frame` | Drawing frame (A4/A3) |
| GET | `/projects/{id}/views/{viewId}` | Get view payload |

## Frontend layout

- Left sidebar: Views | Files tabs
- Center: canvas (diagram or text)
- Right sidebar: selected artifact details
- Header: project switcher, New / Save
