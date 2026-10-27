# chargeInlet

Inlet where a home or DC charger connects. Feeds the battery.

Part of `Car`.

## Relations

- Depends on `battery` («Energy»).
- Satisfies `ChargeTime`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `SkateboardView`

## Interfaces

- Provider port `chargeOut` : ChargeFeed, connected to the battery.
