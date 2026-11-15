# windshield

Front glass. Consumes WindshieldClear from the wipers.

Part of `Car`.

## Relations

- Depends on `body` («Mount»).
- `wipers` depends on this («Clear»).
- Implemented by `windshieldGlass`.
- Satisfies `ForwardVisibility`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `clearIn` : WindshieldClear, connected from `wipers`.
