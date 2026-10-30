# keyFob

Remote key the driver carries. Provides Credential to the vehicle controller for unlock, lock and start.

Part of `Car`.

## Relations

- Depends on `vehicleController` («Command»).

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `credentialOut` : Credential, connected to `vehicleController`.
