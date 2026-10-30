# batteryControlSw

Software component for battery limits and charge sessions. Provides EnergySupply and consumes ChargeFeed.

Part of `batteryEcu`.

## Relations

- Implements `battery`.
- Implements `chargeInlet`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `energyOut` : EnergySupply, bound to `batteryEcu`.
- Consumer port `chargeIn` : ChargeFeed, bound to `batteryEcu`.
