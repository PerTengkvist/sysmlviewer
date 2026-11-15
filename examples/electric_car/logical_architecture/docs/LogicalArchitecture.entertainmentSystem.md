# entertainmentSystem

Logical cabin audio and video. Consumes EnergySupply from the battery.

Part of `Car`.

## Relations

- Comprises `mediaPlayback`.
- Depends on `battery` («Energy»).

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `energyIn` : EnergySupply, connected from `battery`.
