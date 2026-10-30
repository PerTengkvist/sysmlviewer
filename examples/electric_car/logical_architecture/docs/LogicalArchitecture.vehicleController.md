# vehicleController

Decides whether the car is Locked, Unlocked, Ready, Driving, Parked or Charging. Authenticates the key fob, releases the immobilizer, enables the drive controller and tells the driver through the instrument cluster.

Part of `Car`.

## Relations

- `keyFob` depends on this («Command»).
- `startButton` depends on this («Command»).
- Depends on `driveController` («Enable»).
- Depends on `instrumentCluster` («Inform»).
- Satisfies `Immobilizer`.
- Satisfies `PowerModes`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `credentialIn` : Credential, connected from `keyFob`.
- Consumer port `startIn` : StartRequest, connected from `startButton`.
- Provider port `driveEnableOut` : DriveEnable, connected to `driveController`.
- Provider port `feedbackOut` : DriverFeedback, connected to `instrumentCluster`.
