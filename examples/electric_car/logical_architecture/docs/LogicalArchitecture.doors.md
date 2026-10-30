# doors

Four doors in the body shell. Consume DoorCommand from the body controller and report open or closed.

Part of `Car`.

## Relations

- `bodyController` depends on this («Command»).
- Depends on `body` («Mount»).
- Satisfies `CabinAccess`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `doorIn` : DoorCommand, connected from `bodyController`.
