# entertainmentSystem

Logical cabin audio and video. Consumes EnergySupply from the battery.

Part of `Car`.

## Relations

- Comprises `mediaPlayback`.
- Depends on `battery` («Energy»).
- Implemented by `infotainmentEcu`.
- Implemented by `entertainmentSw`.
- Implemented by `displayAndSpeakers`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `energyIn` : EnergySupply, connected from `battery`.
