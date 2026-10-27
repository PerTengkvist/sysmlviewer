# wheels

Road wheels that accelerate, brake and steer the car. Supported by the suspension.

Part of `Car`.

## Relations

- `steeringWheel` depends on this («Command»).
- `brakePedal` depends on this («Command»).
- Depends on `suspension` («Support»).
- Satisfies `BrakingDistance`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `SkateboardView`

## Interfaces

- Consumer ports `directionIn` : DirectionCommand and `brakeIn` : BrakeRequest.
