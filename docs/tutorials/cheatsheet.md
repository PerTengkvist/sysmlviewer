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
