# batteryControlSw

Software component for battery limits and charge sessions. Hosted on the battery computer. Implements the logical battery and the logical charge inlet.

Part of `batteryEcu`.

## Relations

- Implements logical `battery`.
- Implements logical `chargeInlet`.

## Diagrams

- `PhysicalView`
- `PhysicalTree`

## Interfaces

- Provider port `energyOut` : EnergySupply. Consumer port `chargeIn` : ChargeFeed.
