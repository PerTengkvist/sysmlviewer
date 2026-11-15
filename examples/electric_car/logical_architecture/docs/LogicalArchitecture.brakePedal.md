# brakePedal

Driver control for deceleration. Provides BrakeRequest to the drive controller.

Part of `Car`.

## Relations

- Depends on `driveController` («Command»).
- Implemented by `brakePedalMech`.
- Satisfies `BrakingDistance`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `brakeOut` : BrakeRequest, connected to `driveController`.
