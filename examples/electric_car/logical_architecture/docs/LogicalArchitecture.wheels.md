# wheels

Road wheels that accelerate, brake and steer the car. Consume DirectionCommand from the drive controller; the engine and the friction brakes act on them.

Part of `Car`.

## Relations

- `driveController` depends on this («Command»).
- Depends on `suspension` («Support»).
- `engine` depends on this («Actuate»).
- `frictionBrakes` depends on this («Actuate»).

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `directionCommandIn` : DirectionCommand, connected from `driveController`.
