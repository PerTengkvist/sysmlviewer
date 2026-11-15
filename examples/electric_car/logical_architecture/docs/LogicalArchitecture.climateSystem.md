# climateSystem

Logical heating, ventilation and cooling of the cabin. Consumes EnergySupply from the battery.

Part of `Car`.

## Relations

- Comprises `cabinTemperature`.
- Depends on `battery` («Energy»).
- Implemented by `infotainmentEcu`.
- Implemented by `climateControlSw`.
- Implemented by `hvacAssembly`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `energyIn` : EnergySupply, connected from `battery`.
