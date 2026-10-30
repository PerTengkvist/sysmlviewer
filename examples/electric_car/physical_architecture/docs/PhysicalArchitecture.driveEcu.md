# driveEcu

Embedded computer for torque, braking, gear and steering. Implements the logical drive controller. Proxy ports expose the driver inputs and the actuator commands at the ECU boundary.

Part of `VehiclePhysical`.

## Relations

- Implements `driveController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `driveEnableIn` : DriveEnable, bound to `driveControlSw`, connected from `vehicleEcu`.
- Consumer port `torqueIn` : TorqueRequest, bound to `driveControlSw`, connected from `acceleratorPedalMech`.
- Consumer port `brakeIn` : BrakeRequest, bound to `driveControlSw`, connected from `brakePedalMech`.
- Consumer port `gearIn` : GearCommand, bound to `driveControlSw`, connected from `gearStickMech`.
- Consumer port `directionIn` : DirectionCommand, bound to `driveControlSw`, connected from `steeringWheelMech`.
- Provider port `torqueCommandOut` : TorqueCommand, bound to `driveControlSw`, connected to `engineEcu`.
- Provider port `brakeCommandOut` : BrakeCommand, bound to `driveControlSw`, connected to `brakeCaliperAsm`.
- Provider port `gearCommandOut` : GearCommand, bound to `driveControlSw`, connected to `engineEcu`.
- Provider port `directionCommandOut` : DirectionCommand, bound to `driveControlSw`, connected to `wheelSet`.
