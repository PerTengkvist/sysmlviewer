# acceleratorPedalMech

Mechanical accelerator pedal with travel sensor. Provides TorqueRequest to the drive computer.

Part of `VehiclePhysical`.

## Relations

- Implements `acceleratorPedal`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `torqueOut` : TorqueRequest, connected to `driveEcu`.
