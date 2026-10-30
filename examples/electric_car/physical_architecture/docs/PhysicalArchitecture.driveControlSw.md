# driveControlSw

Software component for torque arbitration, regen blending, gear mode and steering angle. Hosted on the drive computer.

Part of `driveEcu`.

## Relations

- Implements `driveController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `driveEnableIn` : DriveEnable, bound to `driveEcu`.
- Consumer port `torqueIn` : TorqueRequest, bound to `driveEcu`.
- Consumer port `brakeIn` : BrakeRequest, bound to `driveEcu`.
- Consumer port `gearIn` : GearCommand, bound to `driveEcu`.
- Consumer port `directionIn` : DirectionCommand, bound to `driveEcu`.
- Provider port `torqueCommandOut` : TorqueCommand, bound to `driveEcu`.
- Provider port `brakeCommandOut` : BrakeCommand, bound to `driveEcu`.
- Provider port `gearCommandOut` : GearCommand, bound to `driveEcu`.
- Provider port `directionCommandOut` : DirectionCommand, bound to `driveEcu`.
