# battery

Traction battery, nominally 60 kWh. Mounted on the chassis. Supplies the motor, climate, entertainment and the other electric loads. Charged through the charge inlet.

Part of `Car`.

## Relations

- `engine` depends on this («Energy»).
- `climateSystem` depends on this («Energy»).
- `entertainmentSystem` depends on this («Energy»).
- `lamps` depends on this («Energy»).
- `chargeInlet` depends on this («Energy»).
- Depends on `chassis` («Mount»).
- Satisfies `Range`.
- Satisfies `ChargeTime`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `SkateboardView`

## Interfaces

- Provider port `energyOut` : EnergySupply. Consumer port `chargeIn` : ChargeFeed.
