# engine

Electric traction motor, nominally 150 kW. Mounted on the chassis, fed by the battery, and commanded by the pedals and the gear stick.

Part of `Car`.

## Relations

- `gearStick` depends on this («Command»).
- `acceleratorPedal` depends on this («Command»).
- Depends on `battery` («Energy»).
- Depends on `chassis` («Mount»).
- Satisfies `Acceleration`.
- Satisfies `TopSpeed`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `SkateboardView`

## Interfaces

- Consumer ports `gearIn` : GearCommand, `torqueIn` : TorqueRequest, `energyIn` : EnergySupply.
