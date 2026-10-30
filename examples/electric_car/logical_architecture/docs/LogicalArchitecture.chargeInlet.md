# chargeInlet

Inlet where a home or DC charger connects. Provides ChargeFeed to the battery.

Part of `Car`.

## Relations

- Depends on `battery` («Energy»).
- Satisfies `ChargeTime`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `chargeOut` : ChargeFeed, connected to `battery`.
