# steeringWheel

Driver control for direction. Provides DirectionCommand to the drive controller.

Part of `Car`.

## Relations

- Depends on `driveController` («Command»).
- Implemented by `steeringWheelMech`.
- Satisfies `DirectionalControl`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `directionOut` : DirectionCommand, connected to `driveController`.
