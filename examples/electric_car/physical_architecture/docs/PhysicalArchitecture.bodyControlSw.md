# bodyControlSw

Software component for lock, door, window, lamp and wiper control. Hosted on the body computer.

Part of `bodyEcu`.

## Relations

- Implements `bodyController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `lockOut` : LockCommand, bound to `bodyEcu`.
- Provider port `doorOut` : DoorCommand, bound to `bodyEcu`.
- Provider port `windowOut` : WindowCommand, bound to `bodyEcu`.
- Provider port `lampOut` : LampCommand, bound to `bodyEcu`.
- Provider port `wipeOut` : WipeCommand, bound to `bodyEcu`.
