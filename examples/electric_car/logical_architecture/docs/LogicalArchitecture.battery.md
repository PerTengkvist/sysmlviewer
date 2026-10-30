# battery

Traction battery, nominally 60 kWh. Provides EnergySupply and consumes ChargeFeed. Its discharge limit bounds the torque the drive controller may command.

Part of `Car`.

## Relations

- Comprises `chargeSession`.
- Comprises `energyStorage`.
- `engine` depends on this («Energy»).
- `climateSystem` depends on this («Energy»).
- `entertainmentSystem` depends on this («Energy»).
- `lamps` depends on this («Energy»).
- `windowLifts` depends on this («Energy»).
- `chargeInlet` depends on this («Energy»).
- Depends on `chassis` («Mount»).
- Satisfies `Range`.
- Satisfies `ChargeTime`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `energyOut` : EnergySupply, connected to `engine`, connected to `climateSystem`, connected to `entertainmentSystem`, connected to `lamps`, connected to `windowLifts`.
- Consumer port `chargeIn` : ChargeFeed, connected from `chargeInlet`.
