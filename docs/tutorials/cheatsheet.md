# SysML v2 Cheatsheet

Short syntax reminders with examples.

## Packages

```sysml
package VehicleModel {
  // members…
}
```

## Parts

```sysml
part def Engine;
part engine : Engine;
```

## Attributes

```sysml
part def Battery {
  attribute capacity : Real;
  attribute _icon = "user";
}
```

## Part icons

Viewer-only attributes (hidden from the attribute list on the diagram):

| Attribute | Placement |
|---|---|
| `_icon` | Header / title row |
| `_icon_body` | Centered in the part body (blackbox). When child parts are visible (whitebox), same as `_icon` in the header. Scales with the part up to 150% of the normal body-icon size. |

### Lucide (default)

Bare names resolve to [Lucide](https://lucide.dev/icons/):

```sysml
attribute _icon = "battery";
attribute _icon = "zap";
```

### SVG libraries (vendored into the project)

Prefixed names use curated libraries. On first use the SVG is downloaded into
`<project>/icons/<lib>/<name>.svg` and served offline afterwards.

```sysml
attribute _icon = "iconmind/agent";
attribute _icon_body = "iconoven/electric-motor";
attribute _icon_body = "energy/busbar";      // master from Settings (default 20)
attribute _icon_body = "energy/busbar-20";   // Iconify-style name also works
```

| Prefix | Library | Notes |
|---|---|---|
| `iconmind/` | IconMind | AI/agent icons |
| `iconoven/` | IconOven | UI stroke icons (`round` / `sharp` in Settings) |
| `energy/` | Energy Icons | Optical masters `20` / `48` / `20-bold` / `48-bold` in Settings |

Enable/disable libraries and default styles under **Settings → Icon libraries**.

### Where to find icon names

Browse and search open-source sets on [Iconify](https://icon-sets.iconify.design/)
(e.g. query [busbar](https://icon-sets.iconify.design/?query=busbar)).

- **Energy Icons** on Iconify use ids like `energy-icons:busbar-20`. In SysML write
  `energy/busbar` (Settings picks the master) or `energy/busbar-20`.
- **Lucide** names match the site (kebab-case).
- IconMind / IconOven: use the set’s slug after the prefix (`iconmind/…`, `iconoven/…`).

## Views

A diagram is a `view` usage, typed by a standard view:

```sysml
view CarLogicalView : GeneralView {
  expose LogicalArchitecture;
}
```

A `view def` defines a kind of view and is not a diagram itself. A usage takes
its diagram type, `expose` and filters from the definition when it has none of
its own:

```sysml
view def PartsOnly :> GeneralView {
  filter @PartUsage;
}
view carParts : PartsOnly {
  expose LogicalArchitecture;
}
```

`view def X : GeneralView { expose … }` still opens as a diagram when no usage
refers to it, with a warning.

A view can have several `expose` statements; the diagram shows all of them.
An `expose` may name an element in another file. The first `expose` decides
the diagram type for a GeneralView (part or not). Wildcards (`::*`, `::**`)
are read as the element itself.

```sysml
view UseCaseTraceabilityView : UseCaseView {
  expose Driving;
  expose Requirements::PowerModes;
  expose Requirements::DriveToDestination;
  filter @UseCaseUsage or @RequirementUsage or @Dependency;
}
```

## Connections

```sysml
connect engine.powerOut to motor.powerIn;
```

## Interface usages

Typed port-to-port links (shown as edges in GeneralView, like connections):

```sysml
interface def itf_y;
interface x:itf_y connect part1.a to part2.b;
```

In Details, Kind is the interface class (`itf_y`); use **Locate in Model** to jump to the def in the Model tree.

## Dependencies / associations

```sysml
dependency from Drive to Range;
#extend dependency from EmergencyStop to Brake;
```

## Requirements

```sysml
requirement def Acceleration {
  doc /* Reach 100 km/h in under 8 s. */
}
```

## Use cases

```sysml
use case def Drive {
  subject vehicle : ElectricCar;
  actor Driver;
  objective Requirements::Range;
  include use case Accelerate;
}
```

### Requirement traceability

A use case traces to requirements with `objective`, `#refine dependency`,
`#derive dependency` or `satisfy`:

```sysml
#refine dependency from StartVehicle to Requirements::DriveToDestination;
```

- Double-click a use case: the dialog lists its requirements under
  **Requirements**; click one to open it.
- The **Relations** list in Details shows incoming and outgoing relations
  with the element at the other end, so a requirement shows the use cases
  that trace to it.
- A UseCaseView draws the requirements it exposes, with «objective»,
  «refine» and «satisfy» edges. A GeneralView draws them too.
- The requirement table (GridView) has a **Use cases** column, taken from the
  whole model, so the use cases need not be exposed.

## Sequences

```sysml
interaction def LockSequence {
  lifeline Driver;
  lifeline bodyController;
  lifeline locks;
  message requestLock from Driver to bodyController;
  then message engageLatches from bodyController to locks;
  then #reply message indicateLocked from locks to Driver;
}

view LockSequenceView : SequenceView {
  expose LockSequence;
}
```

`then` chains messages in order. `#reply` marks an acknowledgement, drawn dashed.
