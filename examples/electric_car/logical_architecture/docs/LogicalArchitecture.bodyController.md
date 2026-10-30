# bodyController

Commands the body actuators: locks, doors, window lifts, lamps and wipers. Flashes the indicators to confirm lock and unlock.

Part of `Car`.

## Relations

- Comprises `lockControl`.
- Comprises `wipeControl`.
- Comprises `headlampControl`.
- Comprises `indicatorControl`.
- Depends on `locks` («Command»).
- Depends on `doors` («Command»).
- Depends on `windowLifts` («Command»).
- Depends on `lamps` («Command»).
- Depends on `wipers` («Command»).
- Satisfies `LockIndication`.

## Diagrams

- `CarLogicalView`
- `CarLogicalDependenciesView`
- `CarLogicalTree`

## Interfaces

- Provider port `lockOut` : LockCommand, connected to `locks`.
- Provider port `doorOut` : DoorCommand, connected to `doors`.
- Provider port `windowOut` : WindowCommand, connected to `windowLifts`.
- Provider port `lampOut` : LampCommand, connected to `lamps`.
- Provider port `wipeOut` : WipeCommand, connected to `wipers`.
