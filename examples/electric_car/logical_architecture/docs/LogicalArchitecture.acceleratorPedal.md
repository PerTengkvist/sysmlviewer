# acceleratorPedal

Driver control for requested traction torque. Provides TorqueRequest to the drive controller.

Part of `Car`.

## Relations

- Depends on `driveController` («Command»).

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `torqueOut` : TorqueRequest, connected to `driveController`.
