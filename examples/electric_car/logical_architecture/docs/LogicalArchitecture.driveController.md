# driveController

Turns pedal, gear and steering inputs into torque, brake pressure, motor mode and wheel angle. Blends regenerative and friction braking. Only acts when the vehicle controller has enabled driving.

Part of `Car`.

## Relations

- Comprises `torqueArbitration`.
- Comprises `regenBlending`.
- Comprises `steeringControl`.
- Comprises `gearSelection`.
- `steeringWheel` depends on this («Command»).
- `gearStick` depends on this («Command»).
- `acceleratorPedal` depends on this («Command»).
- `brakePedal` depends on this («Command»).
- `vehicleController` depends on this («Enable»).
- Depends on `engine` («Command»).
- Depends on `wheels` («Command»).
- Depends on `frictionBrakes` («Command»).
- Satisfies `BrakingDistance`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `driveEnableIn` : DriveEnable, connected from `vehicleController`.
- Consumer port `torqueIn` : TorqueRequest, connected from `acceleratorPedal`.
- Consumer port `brakeIn` : BrakeRequest, connected from `brakePedal`.
- Consumer port `gearIn` : GearCommand, connected from `gearStick`.
- Consumer port `directionIn` : DirectionCommand, connected from `steeringWheel`.
- Provider port `torqueCommandOut` : TorqueCommand, connected to `engine`.
- Provider port `brakeCommandOut` : BrakeCommand, connected to `frictionBrakes`.
- Provider port `gearCommandOut` : GearCommand, connected to `engine`.
- Provider port `directionCommandOut` : DirectionCommand, connected to `wheels`.
