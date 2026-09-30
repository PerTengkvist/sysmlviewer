# gearStick

Driver control for park, reverse, neutral and drive. Commands the traction motor's operating mode.

Part of `Car`.

## Relations

- Depends on `engine` («Command»).
- Satisfies `PropulsionModes`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`

## Interfaces

- Provider port `gearOut` : GearCommand, connected to the engine.
