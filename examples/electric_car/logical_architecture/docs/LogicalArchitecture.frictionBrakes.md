# frictionBrakes

Hydraulic friction brakes on every wheel. Consume BrakeCommand from the drive controller and act on the wheels.

Part of `Car`.

## Relations

- `driveController` depends on this («Command»).
- Depends on `wheels` («Actuate»).
- Satisfies `BrakingDistance`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `brakeCommandIn` : BrakeCommand, connected from `driveController`.
