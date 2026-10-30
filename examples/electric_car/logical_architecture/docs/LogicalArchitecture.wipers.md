# wipers

Wiper and washer mechanism on the body. Consumes WipeCommand from the body controller and provides WindshieldClear to the windshield.

Part of `Car`.

## Relations

- Comprises `wipeSweep`.
- `bodyController` depends on this («Command»).
- Depends on `body` («Mount»).
- Depends on `windshield` («Clear»).
- Satisfies `ForwardVisibility`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `wipeIn` : WipeCommand, connected from `bodyController`.
- Provider port `clearOut` : WindshieldClear, connected to `windshield`.
