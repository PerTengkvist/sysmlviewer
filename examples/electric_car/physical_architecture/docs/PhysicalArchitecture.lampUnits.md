# lampUnits

Mechanical lamp units. Consume LampCommand from the body computer and EnergySupply.

Part of `VehiclePhysical`.

## Relations

- Implements `lamps`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `lampIn` : LampCommand, connected from `bodyEcu`.
- Consumer port `energyIn` : EnergySupply, connected from `batteryEcu`.
