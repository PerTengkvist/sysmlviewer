# entertainmentSystem

Logical cabin audio and video. Consumes EnergySupply from the battery.

Part of `Car`.

## Relations

- Depends on `battery` («Energy»).
- Satisfies `CabinMedia`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `energyIn` : EnergySupply, connected from `battery`.
