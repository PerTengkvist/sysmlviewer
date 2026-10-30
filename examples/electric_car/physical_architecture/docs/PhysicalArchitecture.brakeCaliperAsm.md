# brakeCaliperAsm

Hydraulic calipers, discs and the brake actuator. Consume BrakeCommand from the drive computer.

Part of `VehiclePhysical`.

## Relations

- Implements `frictionBrakes`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `brakeCommandIn` : BrakeCommand, connected from `driveEcu`.
