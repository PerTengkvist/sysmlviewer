# acceleratorPedal

Driver control for requested traction torque. Commands the engine (electric motor).

Part of `Car`.

## Relations

- Depends on `engine` («Command»).

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`

## Interfaces

- Provider port `torqueOut` : TorqueRequest, connected to the engine.
