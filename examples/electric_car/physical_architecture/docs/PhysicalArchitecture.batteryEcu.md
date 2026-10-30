# batteryEcu

Embedded computer for the traction battery and charging. Separate module. Implements the logical battery. Proxy ports expose EnergySupply and ChargeFeed at the ECU boundary.

Part of `VehiclePhysical`.

## Relations

- Implements `battery`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `energyOut` : EnergySupply, bound to `batteryControlSw`, connected to `electricMotor`, connected to `hvacAssembly`, connected to `displayAndSpeakers`, connected to `lampUnits`, connected to `windowLiftAsm`.
- Consumer port `chargeIn` : ChargeFeed, bound to `batteryControlSw`, connected from `chargeInletMech`.
