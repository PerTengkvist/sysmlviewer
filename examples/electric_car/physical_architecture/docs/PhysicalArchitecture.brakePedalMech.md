# brakePedalMech

Mechanical brake pedal with force sensor. Provides BrakeRequest to the drive computer.

Part of `VehiclePhysical`.

## Relations

- Implements `brakePedal`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `brakeOut` : BrakeRequest, connected to `driveEcu`.
