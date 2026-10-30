# vehicleControlSw

Software component for vehicle modes, key authentication and driver feedback. Hosted on the vehicle computer.

Part of `vehicleEcu`.

## Relations

- Implements `vehicleController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `credentialIn` : Credential, bound to `vehicleEcu`.
- Consumer port `startIn` : StartRequest, bound to `vehicleEcu`.
- Provider port `driveEnableOut` : DriveEnable, bound to `vehicleEcu`.
- Provider port `feedbackOut` : DriverFeedback, bound to `vehicleEcu`.
