# Security

Authenticate the key, unlock and lock the car, hold the immobilizer until the car is started, switch the car on and off, and let occupants open the doors and move the windows of an unlocked car. Every driving function depends on Security before the car will move. Five flows: securityFlow unlocks the car with the key fob and lockFlow locks it; startFlow makes the car Ready and stopFlow switches it off again; cabinAccessFlow moves a door or a window. Only startFlow releases the immobilizer, so an unlocked car cannot drive until an approved key starts it.

Part of `Functions`.

## Relations

- `SpeedControl` depends on this («Authorize»).
- `Maneuvrability` depends on this («Authorize»).
- `Entertainment` depends on this («Authorize»).
- `Lighting` depends on this («Authorize»).
- Refines `StartVehicle`.
- Refines `StopVehicle`.
- Refines `Unlock`.
- Refines `Lock`.
- Refines `OpenDoor`.
- Refines `CloseDoor`.
- Refines `OpenWindow`.
- Refines `CloseWindow`.

## Diagrams

- `FunctionsView`
- `FunctionAllocationView`
