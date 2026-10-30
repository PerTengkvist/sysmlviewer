# windowLifts

Motors that raise and lower the side windows. Consume WindowCommand from the body controller and EnergySupply from the battery. Stop on pinch.

Part of `Car`.

## Relations

- `bodyController` depends on this («Command»).
- Depends on `battery` («Energy»).
- Depends on `body` («Mount»).
- Satisfies `CabinAccess`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `windowIn` : WindowCommand, connected from `bodyController`.
- Consumer port `energyIn` : EnergySupply, connected from `battery`.
