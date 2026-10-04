# wipers

Wiper and washer mechanism on the body, acting on the windshield.

Part of `Car`.

## Relations

- Depends on `body` («Mount»).
- Depends on `windshield` («Clear»).
- Satisfies `ForwardVisibility`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `BodyView`

## Interfaces

- Provider port `clearOut` : WindshieldClear, connected to the windshield.
