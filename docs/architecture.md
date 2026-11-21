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
- `kind` — `package` | `part` | `port` | `connection` | `view` | `attribute` | `interaction` | `lifeline` | `message` | `occurrence` | `eventOccurrence` | `state` | `transition` | `action` | `succession`
- `name`, `parentId`
- `typeRef` (optional), `sourceId` / `targetId` for connections/messages/transitions/successions
- `sourceEventId` / `targetEventId` — only on occurrence-form messages, and only when set: the event occurrence each end is drawn at (or `<lifeline>::<name>` when it does not resolve)
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

**Tags.** Text and markdown output (and `--spof`) show use cases and requirements as `<short name> <name>` (`UC006 Brake`, `REQ-SAFE-02 BrakingDistance`), sorted by tag; elements without a short name show only the name. The JSON nodes carry the tag as `shortId` (null when absent). Short names come from `use case def <'UC006'> Brake` and `requirement def <'REQ-SAFE-02'> BrakingDistance`.

**Unique labels.** A simple name is only unique within its namespace. When two nodes in the impact graph would print the same label, each of them is shown with the shortest suffix of its qualified id that tells them apart (`Security::authenticate` and `Comfort::authenticate`); a tag stays in front (`UC006 Driving::Brake`) and a physical part keeps its owner path (`Phys1::V::pack.cell`). Uniqueness is graph-wide and spans layers: a function `Funcs::Brake` and a logical part `Log::Brake` are both qualified, and an unqualified label is qualified too if a qualified one would otherwise equal it. FMEA item names, the flag lines and the coverage lists follow the same rule (item names also across parts that are not in the graph; C_r is keyed on the part id). Labels that are already unique are unchanged, and JSON ids are never affected. An `ImpactGraph` is not changed after extraction; the label cache lives on the graph object and `dataclasses.replace` starts with an empty one. The labels are built once per graph in `domain/failure/labels.py` and used by the failure report and the FMEA/FMECA reports alike.

**Command line.** `--fail <name>:<kind>[:<fraction>][:<count>]` (repeatable) or `--spof` (every physical part lost in turn, one instance of a group), `--format text|markdown|json`. Names are resolved first with `NameResolver`, then as a suffix of whole segments (`.` counts as `::`); an ambiguous name lists its candidates and an unknown name suggests close matches (exit 2). Parser warnings stop the run (exit 1) unless `--allow-warnings` is given. The JSON output has `failures`, `nodes` (per id: `layer`, `capability`, `status`, `limitedBy`, `flags`, `chain`), `functions`, `useCases`, `requirements` (the ones that are not OK, LOST first) and `warnings`.

### FMEA/FMECA (toolbox)

`scripts/fmea.py` puts an FMEA or FMECA on top of the failure-impact engine. The rule of thumb: if a change alters how the system is built, it belongs in the SysML model; if it alters how it fails, it belongs in the FMEA data. Redundancy (`#Pool`, `#Redundant`, multiplicity, `required`) therefore stays in SysML, so a data file cannot quietly change the architecture. The data holds only the **local effect** of each failure mode (`loss`, `degraded` with a fraction, or `erroneous`), rates and scores. The **next higher effect** (logical parts, functions) and the **end effect** (use cases, requirements) are computed by `domain/failure`, so an architecture change recomputes the table.

Code: `backend/src/domain/fmea/` (`schema` pydantic models, `model`, `load`, `severity`, `validate`, `analyze`, `export`, `simulate`) is domain code. It may use pydantic (decision B1) but not `adapters`, FastAPI, `json` or `yaml` (`tests/test_domain_purity.py`). Reading YAML and the line number of every key is `backend/src/adapters/fmea/yaml_source.py`. No API endpoint, no viewer change; the data is not read by the viewer.

**Data** in `<project>/fmea/` (a different folder with `--fmea-dir`), each file starting with a `# yaml-language-server: $schema=...` comment that points at `docs/schemas/`:

| File | Content |
|---|---|
| `library/<name>.yaml` | `part_def` (qualified name), `rate_fit` (lambda_p, FIT = failures per 1e9 h) and `failure_modes`. Applies to every part usage typed by that definition (`typeTargetId`). |
| `instances.yaml` | A list of entries: `part` (qualified name of a usage), optional `rate_fit`, `failure_modes`, `srus` (sub-units that are not in SysML, each with its own `rate_fit` and modes) and `overrides` (change a library mode by `id` for this usage only). |
| `severity.yaml` | `requirement_groups`, `status_factor`, `default_group_score`, `spof_severity_threshold`, `mission_time_h`, `occurrence_scale`, `severity_classes`, `probability_levels`. |

A failure mode has `id` (`^[a-z][a-z0-9_]*$`), `local_effect`, `mode_ratio` (alpha), `effect_probability` (beta), `occurrence`, `detection {method, score}`, `description` and `mitigation`. Unknown keys are errors. The sum of the `mode_ratio` is checked per merged item or SRU, after library, instance entry and overrides are combined (not per YAML list): over 1 is the error `mode-ratio-sum`; below 1 is a note (`validate --notes`), because the rest of the failures may have no modelled effect.

**Two modes.** Every field is optional in the schema; `--mode` decides what is required (`validate` without it checks `both`).

| | FMEA (`--mode fmea`) | FMECA (`--mode fmeca`) |
|---|---|---|
| Per mode | `occurrence` (or lambda_m with an `occurrence_scale`) and `detection.score` | `mode_ratio`, `effect_probability` |
| Per item or SRU | - | `rate_fit` |
| `severity.yaml` | `requirement_groups`, `status_factor` | also `mission_time_h` |
| Result | S, O, D, RPN = S*O*D | C_m = lambda_p * alpha * beta * t, C_r = sum of C_m per item, severity class and probability level |
| Ranking | RPN falling, then item and mode id | class (I first), then C_m falling |

- **S** (both modes): for every requirement that is at risk, `round_half_up(group_score * status_factor[status])`; S is the maximum, clamped to 1-10, and 1 when no requirement is at risk. The group of a requirement is its own `Type` attribute when that is a configured group, otherwise the best group reached upwards along `#refine` (`UserStory` is never a group). A requirement without a group gets `default_group_score`.
- **O** is the explicit `occurrence`; without it, lambda_m = `rate_fit` * `mode_ratio` is looked up in `occurrence_scale` (ascending `{max_fit, score}`; above the last step 10).
- **D** has no default: a mode without `detection.score` is an error in FMEA mode.
- **Class and level** come from `severity_classes` (smallest S per class) and `probability_levels` (smallest C_m per level); the defaults are I for S 9-10, II 7-8, III 4-6, IV 1-3 and A >= 0.2, B >= 0.1, C >= 0.01, D >= 0.001, otherwise E.
- **SPOF**: modes that alone make a function LOST and have `S >= spof_severity_threshold`.
- **Flags** from the engine are kept per row (`common_cause`, `erroneous_as_loss`, `redundancy_exhausted`, `pool_at_minimum`). For a group usage a mode hits one instance; `Qty` is the number of instances and C_m is per instance.

**Validation** (`validate`, also run first by `analyze` and `simulate`) fails when the data and the model have drifted apart: `unknown-part-def`, `unknown-part`, `not-a-part-def`, `not-a-part-usage`, `ambiguous-part`, `ambiguous-part-def`, `unknown-mode-id`, `duplicate-part` (two entries in `instances.yaml` for the same part; both places are reported), `mode-ratio-sum` and `missing-field` (per mode). A library whose `part_def` has no typed usage in the model is the warning `unused-library` (its modes apply to nothing, for example after the usages were retyped). A short but unique `part_def` or `part` is accepted with a `short-reference` warning; a short name that matches several definitions is `ambiguous-part-def` and lists the candidates. Each finding has the file, the line, the reference, close matches (difflib on the last name segment) and a fix. A short but unique `part` reference is a warning (`use the qualified name ...`). Severity groups that do not match the `Type` of any requirement, and the other way round, are warnings. `coverage` lists physical parts without failure modes, modes on parts that implement nothing, and requirements without a group.

**Simulation** (`simulate`, needs FMECA data): for each trial, item instance and mode `T = -ln(1-u)/lambda_m` is drawn with a seeded `random.Random`; the first mode of an instance with `T <= t` strikes it (competing risks, SRU modes strike the LRU, erroneous counts as loss). All times are drawn before the comparison with `t`, so one seed gives the same sample for any `t`. The effect of a set of failures is computed by the trace engine and cached per set. The result is `P(LOST)` and `P(DEGRADED)` per function, use case and requirement. Beta is not used (decision B9); it only enters C_m.

**Limits and risks.**

- Competing risks count only the first failure of an instance. A degraded mode that strikes first hides a later loss of the same instance, so the loss probability is slightly underestimated when degraded modes are common.
- C_m and C_r are per instance. For a group usage (`Qty` above 1) multiply by `Qty`; the FMECA markdown table says so in a note below the table, and the CSV keeps its fixed columns.
- A requirement takes the group of its own `Type` when that is a configured group, and the search upwards stops there, even if the requirement refines one of a higher group. Without a configured own `Type` the highest group reached upwards along `#refine` counts. Mixing requirement levels in one refine chain is bad practice, so `validate` gives the warning `severity-downgrade` when a requirement's own group scores lower than the best group further up the chain. The message names the requirement, its `Type` and score, the ancestor with the highest group and its score, says that S follows the own `Type`, and asks whether the mix is intended (the model gives no line numbers, so the qualified id is used). The warning never changes S or the exit code; `analyze` prints it to stderr like other data warnings. The search upwards is cycle safe. The electric car gives none, since only the group requirements have a `Type`.

**Tags.** Use cases and requirements in `End effect` (and `Requirements at risk` in the SPOF table) are labelled like the failure report, with the short name first: `UC007 Accelerate LOST`, `REQ-SAFE-02 BrakingDistance LOST`. They are sorted by tag, untagged elements after them by name. The label comes from `domain/failure/labels.label` and is qualified when two elements share it (see **Unique labels** above). `Next higher effect` (logical parts, functions) has no tags. In JSON every effect has `id`, `label`, `shortId` (null when untagged), `layer` and `status`, and a SPOF entry also lists `requirements` with the same fields.

**Command line.** `validate [--mode fmea|fmeca|both] [--notes]`, `coverage`, `analyze [--mode fmea|fmeca] [--format markdown|csv|json] [--spof] [--out [DIR]] [--trials N --seed S]`, `simulate [--trials N] [--seed S] [--mission-time H] [--format ...] [--out [DIR]]` and `schema [--write] [--out DIR]` (writes the JSON Schemas; `tests` compare them with `docs/schemas/`). Exit codes: 0 ok, 1 drift or validation errors (nothing is analysed), 2 usage error. CSV has fixed columns and one row per failure mode: `Item, Qty, SRU, Function, Failure mode, Local effect, Next higher effect, End effect, S, Flags, Detection method`, then `O, D, RPN` (FMEA) or `Rate (FIT), Mode ratio, Effect probability, Mission time (h), Criticality, Severity class, Probability level` (FMECA). Lists in a cell are separated by `; `.

**Reports (`--out`).** `analyze --out [DIR]` writes, instead of printing, `<mode>-table.csv` (`fmea-table.csv` or `fmeca-table.csv`), `<mode>-spof.csv` (the ranking differs per mode), `coverage.csv` (the same for both modes) and the markdown report `<mode>-report.md` to `DIR` (default `<fmea dir>/docs`, so `<project>/fmea/docs/`), and prints the paths. With `--mode fmeca --trials N [--seed S]` it also simulates, writes `simulation.csv` and adds a `## Simulation` section (an FMECA report without `--trials` says the simulation was not run); `--trials` without `--mode fmeca` and `--out`, `--seed` without `--trials`, `--spof` or `--format` together with `--out`, and an `--out` that is a file are usage errors (exit 2). `simulate --out [DIR]` writes only `simulation.csv`. The report (`domain/fmea/export.py: to_report_markdown`) has Summary, Top risks (5), Single points of failure, Criticality matrix (a table, plus a mermaid `quadrantChart` in FMECA mode), Item criticality (FMECA: C_r per item and severity class), Effect chains (one mermaid `flowchart` per mode with S at or above the SPOF threshold), Coverage, Simulation (optional) and Files. It has no timestamp, so the output is byte-identical for identical inputs. Because the folder is called `docs`, the viewer lists the reports in the Files tab and renders the mermaid in the markdown canvas; the list is read when the project is opened. The Electric Car reports in `examples/electric_car/fmea/docs/` are committed, and `tests/test_fmea_outputs.py::test_committed_reports_are_current` fails when they no longer match; regenerate them with `analyze --mode fmea --out` and `analyze --mode fmeca --trials 2000 --seed 1 --out`.

**Drift demo.** `scripts/electric_car_trigger_fmea_failure.py apply|reset [--project DIR]` works only on Electric Car. `apply` renames the part def `BatteryModule` to `BatteryCellModule` in both places in `vehicle_physical.sysml`, so the model stays valid while `fmea/library/battery_module.yaml` is out of date and `fmea.py validate|analyze|simulate` exit 1. The original bytes and checksums go to the ignored `<project>/.sysmlviewer/fmea_trigger.json`; `reset` restores the `.sysml` file, `state.json` and `project.json` byte for byte, refuses if you edited the `.sysml` file or `fmea/library/battery_module.yaml` after `apply`, and never writes in `views/`. It uses no version control. See `docs/tutorials/fmea.md`.

## Use case realization

`domain/realization.py` (`derive_realization(semantic)`, pure domain code) derives how functions, function nodes and logical parts realize a use case. The one link written by hand is a `#refine` dependency from a function step to a use case step; the rest follows from ownership, `perform` and `allocate`. Roles come from relations, not names.

| Role | Definition |
|---|---|
| UC step | action directly in a use case, except `start`/`done` and `then perform X` |
| actor step | UC step that an actor performs: `actor Driver { perform step; }` (the parser reads `perform` and `doc` in an actor body; `resolve_performers` includes actors) |
| system step | UC step that no actor performs |
| function flow, function step | action owned by a part with steps of its own, and an action directly in it |
| function | part that owns a function flow |
| function node | part that performs a function step, or is the source of an `allocate` |
| logical part | target of the function node's `allocate` |

Allowed `#refine` ends: function step or flow to UC step or use case; function or function node to use case. Precision is `step` (function step to UC step), `coarse` (a flow, or a function step towards a use case, or a flow towards a UC step) or `explicit` (function or function node to use case, the form models used before steps); the best precision wins, and `declared` remembers explicit links. `Realization` holds `links`, `actor_steps`, `system_steps`, `step_realizers`, `coarse_realizers`, `uc_functions`, `uc_nodes`, `uc_parts`, `via_include` (a composite use case gets the union of what its included use cases have, marked here), `in_scope` and `findings`.

**Opt-in.** A use case is in scope when one of its steps is the target of a step link. Findings are only reported inside the scope, so a model without step links (the electric car) gets none and behaves as before. Codes: `unrealized-system-step`, `untraced-function-step` (a flow where other steps are linked), `refine-without-step` (explicit function link that no step backs), `explicit-mismatch` (explicit function node link without steps behind it, or the other way round, when the use case has explicit node links), `bad-realization-end` (`#refine` from a UC step or function step to something that is not an allowed end; `#refine` from a use case to a requirement is ordinary traceability and is not reported).

**Consumers.** `scripts/check_sysml.py` prints `REALIZATION <code> <id>: <message>` and a summary line, and exits 1 on findings. `failure/extract.py` adds, after the explicit ones, the `refine` edges `uc_functions` and `uc_nodes` imply (same edge as an explicit `#refine`, deduplicated), so the failure and FMEA reports cannot tell the two forms apart. `domain/dependency_tree.py` adds the same pairs as `refine` edges with the step link's dependency as `relationId`.

## Parser subset

Supported textual constructs:

- `package Name { ... }`
- `part def Name { ... }` / `part name : Type;`
- `port name;` / `port name : Type;`
- `connection name connect A.p to B.q;` / `connect A.p to B.q;`
- `attribute` / `attribute def`
- `view name : GeneralView|SequenceView|StateTransitionView|ActionFlowView|TreeView { expose … }` is a diagram; `view def Name :> GeneralView { … }` defines a kind of view, and a usage typed by it takes its diagram type, `expose` and filters (`domain/view_usage.py`). A `view def` that no usage refers to is still shown as a diagram, with a warning.
- `interaction def` / `lifeline` / `message … from … to …` / `then message …`
- `occurrence def` / `occurrence u : S;` (kind `occurrence`) and `event occurrence e [: T];` (kind `eventOccurrence`, in a part def, a part or an occurrence part). A plain `event e;` is still skipped. Sequence diagrams can be written as an occurrence def, with the participants as part usages that messages refer to (`domain/occurrence.py`):
  - Lifelines are not declared; they are the parts a message uses as an end. The forms are a typed instance (`part`/`ref part k : KeyFob;`), subsetting with a feature chain (`ref part k :> car.keyFob;`, stored with the target `Pkg::Car::keyFob`, the last real feature) or a qualified name, redefinition (`part a :>> partA;`, `part :>> d;`), type plus subsetting, and nested ends (`car.keyFob.pressed`). Targets after `:>`, `subsets`, `:>>` and `redefines` are read as feature chains everywhere; a chain written in an occurrence is kept as written in the relationship's `typeRef`. Parts of an occurrence copy nothing from their type.
  - `[#Kw] [then] message [name] [of Type] from <end> to <end>;` — an end is `a`, `a.sent` or `car.keyFob.pressed`. Order is declaration order (`first … then …` is tolerated, not used). A named message has the id `<occ>::<name>` (anonymous: `<occ>::msgN`); `typeRef` / `typeTargetId` hold the payload type (any kind of definition). `sourceId` / `targetId` are the lifeline parts, the deepest part on the path; the event is found in the part, its type and generals, then through subsetting/redefinition targets. A feature a nested end passes through (`car.keyFob`) is created as `<occ>::car::keyFob` with a redefinition to the original (keyword `materialized`; the serializer leaves it out). What does not resolve is drawn on the part with a warning; a one-file parse stays quiet where another file may supply the type.
  - Legacy `interaction def` / `lifeline` / `message payload from A to B` is supported, the older dialect, and unchanged.
  - A `SequenceView` accepts an `interaction` or an `occurrence` as its root (`expected_root_kinds`; the wrong-root error lists the kinds sorted). For an occurrence the view payload carries the whole subtree (parts, nested and materialised parts, messages) in declaration order, plus the events the messages refer to, which live in part defs outside it. Subsetting and redefinition relations are not sent (their targets are outside the view). Tree views skip event occurrences.
  - The frontend (`sequenceParticipants.ts`) takes the lifelines from the root's kind: `lifeline` elements under an interaction, otherwise the parts that messages use as ends, in order of first appearance. A part no message uses is not drawn (no warning). Both go through the same order/width layout, keyed on the lifeline id; for a nested end that id is `<occ>::car::keyFob`, so a layout saved on legacy ids does not apply. The message label is its name, `#Reply`/`#reply` is dashed, and the header stays «lifeline». Details shows a lifeline's type, `Subsets`/`Redefines` target (as links), `Reference` (`part` or `ref part`), and `From`/`To` with the events on a message.
  - A one-file parse does not warn about a qualified type whose head the file does not declare, nor about any type when the file has an import; the project parse still does.
  - Failure impact and FMEA ignore parts owned by an occurrence.
  - Electric Car's 23 sequences are occurrence defs. Each lifeline is a `ref part` typed by a part def: one per part of `Car` in `LogicalArchitecture::Types` (27, a nested package so that `LogicalArchitecture.Types.KeyFob.md` does not collide with `LogicalArchitecture.keyFob.md` on case-insensitive file systems) and the three actors in `Dynamics`; `Car` types its parts with the same defs. Lifeline ids, default lifeline order and message order are the legacy ones (`tests/fixtures/sequence_migration.json` freezes them); a message id is `Dynamics::<Sequence>::<name>` instead of `…::msgN`, and `#reply` is `#Reply` with `metadata def Reply;`. `scripts/generate_example_docs.py` writes no docs for the parts of an occurrence. The "did you mean" list for an unknown FMEA `part_def` looks in the named package first, so the logical types do not crowd it.
  - Known limits: an occurrence def with several generals keeps only the first; `doc` inside a message body is not read; a message that shares its name with a part keeps the name for the part and moves to `<occ>::name#2`; a written `message msgN` out of the anonymous numbering keeps its name, one in sequence round-trips as anonymous.
- `state def` / nested `state` / `transition … from … to …`
- `action def` / nested `action` / `succession … first … then …` / `first start; then a; then if g then b else c; then done;`
- `abstract part def …` / `abstract action def …` (`isAbstract`, written only when true). `part def` sets `isDefinition` (also only when true), so an abstract definition shows «abstract part def» and an abstract usage «abstract part»; concrete parts keep «part».
- `perform [action] ref;` where `ref` is `name`, `flow.step` or `Pkg::Fn::flow.step`. In an action or case it is a flow step (id `<owner>::<last segment>`); in a part or an actor body (`actor Driver { perform step; doc /* … */ }`, any other member is a warning) it says the part or actor performs that action (id `<owner>::perform_<ref>`, so two performs never merge). The reference is resolved from its owner with the rules in "Name resolution and imports" (so an import only counts in the namespace it is written in); the result is stored as `performTargetId`. A perform whose path does not resolve and whose last segment names no element is a warning with its line.
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
  functional entity's `#refine` to a use case included, and the same links implied by a step-level `#refine`, see "Use case realization") and any dependency
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
