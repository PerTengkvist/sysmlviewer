# locks

Door latches. Consume LockCommand from the body controller and report latched or released.

Part of `Car`.

## Relations

- `bodyController` depends on this («Command»).
- Depends on `body` («Mount»).
- Satisfies `AccessControl`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Consumer port `lockIn` : LockCommand, connected from `bodyController`.
