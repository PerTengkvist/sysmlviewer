# gearStick

Driver control for park, reverse, neutral and drive. Provides GearCommand to the drive controller.

Part of `Car`.

## Relations

- Depends on `driveController` («Command»).
- Satisfies `PropulsionModes`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `gearOut` : GearCommand, connected to `driveController`.
