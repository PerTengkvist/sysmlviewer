# startButton

Driver control that starts and stops the vehicle. Provides StartRequest to the vehicle controller.

Part of `Car`.

## Relations

- Depends on `vehicleController` («Command»).
- Depends on `body` («Mount»).
- Satisfies `PowerModes`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `startOut` : StartRequest, connected to `vehicleController`.
