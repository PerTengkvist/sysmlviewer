# bodyEcu

Embedded computer for locks, doors, windows, lamps and wipers. Implements the logical body controller. Proxy ports expose the body commands at the ECU boundary.

Part of `VehiclePhysical`.

## Relations

- Implements `bodyController`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Provider port `lockOut` : LockCommand, bound to `bodyControlSw`, connected to `doorLockAsm`.
- Provider port `doorOut` : DoorCommand, bound to `bodyControlSw`, connected to `doorAsm`.
- Provider port `windowOut` : WindowCommand, bound to `bodyControlSw`, connected to `windowLiftAsm`.
- Provider port `lampOut` : LampCommand, bound to `bodyControlSw`, connected to `lampUnits`.
- Provider port `wipeOut` : WipeCommand, bound to `bodyControlSw`, connected to `wiperAsm`.
