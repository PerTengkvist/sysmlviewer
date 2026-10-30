# wiperAsm

Mechanical wiper and washer. Consumes WipeCommand from the body computer and provides WindshieldClear.

Part of `VehiclePhysical`.

## Relations

- Implements `wipers`.

## Diagrams

- `PhysicalView`
- `PhysicalDependenciesView`
- `PhysicalTree`

## Interfaces

- Consumer port `wipeIn` : WipeCommand, connected from `bodyEcu`.
- Provider port `clearOut` : WindshieldClear, connected to `windshieldGlass`.
