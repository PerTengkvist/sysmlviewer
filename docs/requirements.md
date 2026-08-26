# SysML Viewer — Requirements (Alpha)

## Vision

A web service that visualizes SysMLv2 files and projects, with a separate *semantic* model (from code) and *visualization* model (style, port anchors, routing) keyed by artifact identity so that re-parsing updates content without destroying layout. **Node geometry** (`x`/`y`/`width`/`height`) may additionally be stored per view (`viewLayouts`) so TreeView and GeneralView can size the same part differently.

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | User can create a named project |
| FR-02 | User can list and switch the active project |
| FR-03 | User can save a project (model + visualization + file references) |
| FR-04 | User can load a saved project |
| FR-05 | User can add `.sysml` files via drop/upload in the Files tab |
| FR-06 | Added files are parsed automatically; visualization objects are created for new artifacts |
| FR-07 | File refresh: re-parse; existing artifacts keep position/size/port offsets/routing; removed artifacts are dropped; new ones get default layout |
| FR-08 | Canvas shows a hierarchical diagram view; click selects an artifact |
| FR-09 | Artifacts are movable; position is stored in the visualization model (per-view geometry via `viewLayouts` when editing a view) |
| FR-09a | TreeView uses compact part sizes by default; GeneralView/whitebox keeps large boundaries for internal structure |
| FR-10 | Ports can be moved along part edges; anchor points are stored |
| FR-11 | Connections have routing type `angular` \| `direct` \| `spline` and stored reference points |
| FR-12 | `>>` menu at top-right of an artifact lists sub-diagrams (navigation) |
| FR-13 | Views tree lists defined views; Files lists project files |
| FR-14 | Right sidebar shows details for the selected artifact |
| FR-15 | Canvas can show text content of a selected `.sysml` file (read-only in alpha) |
| FR-16 | Canvas supports diagram modes: interconnection (`whitebox`/`structure`), Sequence, State Transition, Action Flow, Tree — selected via SysML `view : TypeRef` |
| FR-17 | Sequence/State/Action/Tree views are viewer-first: parse, render, select, persist layout |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Hexagonal backend: domain independent of FastAPI/JSON/Mongo |
| NFR-02 | Visualization key = stable artifact id (qualified name, e.g. `Package::Part::port`) for style, ports, edges |
| NFR-02a | Optional `viewLayouts[viewId].nodes[artifactId]` overlays x/y/width/height for that view only |
| NFR-03 | Merge on refresh: content from parse, layout from existing viz when keys match |
| NFR-04 | Alpha runs locally (API + Vite) |
| NFR-05 | API contract via OpenAPI (FastAPI) |

## Alpha out of scope

- Full OMG symbol catalog / remaining diagram types beyond the modes above
- Complete SysMLv2 grammar, libraries, inheritance beyond subset
- Creating/editing interaction/state/action elements from the UI (viewer-first for those modes)
- Multi-user / auth / realtime collaboration
- Production MongoDB, deploy, CI