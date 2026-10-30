# instrumentCluster

Display and chimes in front of the driver. Consumes DriverFeedback and shows ready state, gear, speed, state of charge and warnings.

Part of `Car`.

## Relations

- Comprises `driverInformation`.
- `vehicleController` depends on this («Inform»).
- Depends on `body` («Mount»).

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `feedbackIn` : DriverFeedback, connected from `vehicleController`.
