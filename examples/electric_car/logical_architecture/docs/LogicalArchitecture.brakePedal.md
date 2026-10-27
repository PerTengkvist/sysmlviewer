# brakePedal

Driver control for deceleration. Commands the wheels through friction braking and regeneration.

Part of `Car`.

## Relations

- Depends on `wheels` («Command»).
- Satisfies `BrakingDistance`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `DriverControlsView`

## Interfaces

- Provider port `brakeOut` : BrakeRequest, connected to the wheels.
