# body

Body shell (kaross). Sets length, width, height, seating and cargo volume, and forms the occupant cell.

Part of `Car`.

## Relations

- Depends on `chassis` («Mount»).
- `windows` depends on this («Mount»).
- `windshield` depends on this («Mount»).
- `wipers` depends on this («Mount»).
- `locks` depends on this («Mount»).
- `lamps` depends on this («Mount»).
- Satisfies `VehicleLength`.
- Satisfies `VehicleWidth`.
- Satisfies `VehicleHeight`.
- Satisfies `PassengerCapacity`.
- Satisfies `CargoVolume`.
- Satisfies `CrashProtection`.
- Satisfies `PedestrianProtection`.
- Satisfies `OccupantRestraint`.

## Diagrams

- `CarLogicalView`
- `CarLogicalTree`
- `BodyView`
