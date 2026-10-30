# vehicleEcu

Embedded computer for power modes, authentication and the immobilizer. Implements the logical vehicle controller. Proxy ports expose Credential, StartRequest, DriveEnable and DriverFeedback at the ECU boundary.

Part of `VehiclePhysical`.

## Relations

- Implements `vehicleController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `credentialIn` : Credential, bound to `vehicleControlSw`, connected from `keyFobUnit`.
- Consumer port `startIn` : StartRequest, bound to `vehicleControlSw`, connected from `startButtonMech`.
- Provider port `driveEnableOut` : DriveEnable, bound to `vehicleControlSw`, connected to `driveEcu`.
- Provider port `feedbackOut` : DriverFeedback, bound to `vehicleControlSw`, connected to `instrumentClusterUnit`.
