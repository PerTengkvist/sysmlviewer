# engineEcu

Embedded computer for the traction motor. Separate module. Implements the logical engine. Proxy ports expose GearCommand and TorqueCommand at the ECU boundary.

Part of `VehiclePhysical`.

## Relations

- Implements `engine`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `gearCommandIn` : GearCommand, bound to `engineControlSw`, connected from `driveEcu`.
- Consumer port `torqueCommandIn` : TorqueCommand, bound to `engineControlSw`, connected from `driveEcu`.
