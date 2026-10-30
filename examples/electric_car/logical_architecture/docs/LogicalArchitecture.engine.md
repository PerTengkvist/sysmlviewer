# engine

Electric traction motor, nominally 150 kW. Consumes GearCommand and TorqueCommand from the drive controller and EnergySupply from the battery. Drives the wheels.

Part of `Car`.

## Relations

- `driveController` depends on this («Command»).
- Depends on `battery` («Energy»).
- Depends on `chassis` («Mount»).
- Depends on `wheels` («Actuate»).
- Satisfies `Acceleration`.
- Satisfies `TopSpeed`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `gearCommandIn` : GearCommand, connected from `driveController`.
- Consumer port `torqueCommandIn` : TorqueCommand, connected from `driveController`.
- Consumer port `energyIn` : EnergySupply, connected from `battery`.
