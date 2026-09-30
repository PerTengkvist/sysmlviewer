# windshield

Front glass. Must stay clear for the driver.

Part of `Car`.

## Relations

- Depends on `body` («Mount»).
- `wipers` depends on this («Clear»).
- Satisfies `ForwardVisibility`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`

## Interfaces

- Consumer port `clearIn` : WindshieldClear.
