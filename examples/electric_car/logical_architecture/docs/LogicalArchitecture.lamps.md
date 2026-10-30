# lamps

Headlamps, tail lamps, brake lamps, direction indicators and hazard lights. Consume LampCommand from the body controller and EnergySupply from the battery.

Part of `Car`.

## Relations

- Comprises `lampDrive`.
- `bodyController` depends on this («Command»).
- Depends on `battery` («Energy»).
- Depends on `body` («Mount»).
- Satisfies `NightVisibility`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `lampIn` : LampCommand, connected from `bodyController`.
- Consumer port `energyIn` : EnergySupply, connected from `battery`.
