# engineControlSw

Software component for motor torque and mode. Consumes GearCommand and TorqueCommand from the drive computer.

Part of `engineEcu`.

## Relations

- Implements `engine`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `gearCommandIn` : GearCommand, bound to `engineEcu`.
- Consumer port `torqueCommandIn` : TorqueCommand, bound to `engineEcu`.
