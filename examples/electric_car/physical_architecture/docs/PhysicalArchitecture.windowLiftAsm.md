# windowLiftAsm

Window lift motors with pinch sensing. Consume WindowCommand from the body computer and EnergySupply.

Part of `VehiclePhysical`.

## Relations

- Implements `windowLifts`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `windowIn` : WindowCommand, connected from `bodyEcu`.
- Consumer port `energyIn` : EnergySupply, connected from `batteryEcu`.
