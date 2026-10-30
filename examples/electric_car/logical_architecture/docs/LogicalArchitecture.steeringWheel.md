# steeringWheel

Driver control for direction. Provides DirectionCommand to the drive controller.

Part of `Car`.

## Relations

- Depends on `driveController` («Command»).
- Satisfies `DirectionalControl`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `directionOut` : DirectionCommand, connected to `driveController`.
