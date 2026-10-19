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

## Views

```sysml
view def CarLogicalView : GeneralView {
  expose LogicalArchitecture;
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
