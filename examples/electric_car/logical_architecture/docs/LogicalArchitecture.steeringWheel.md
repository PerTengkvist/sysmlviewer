# steeringWheel

Driver control for direction. Commands the road wheels. Realized by the steering wheel mechanism and the maneuvrability controller.

Part of `Car`.

## Relations

- Depends on `wheels` («Command»).
- Satisfies `DirectionalControl`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `DriverControlsView`

## Interfaces

- Provider port `directionOut` : DirectionCommand, connected to the wheels.
