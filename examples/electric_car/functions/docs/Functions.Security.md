# Security

Authenticate the driver, unlock and lock the car, release the immobilizer, and let occupants open the doors and move the windows of an unlocked car. Every driving function depends on Security before the car will move. Two flows: securityFlow from key fob to a car that is ready to start, and cabinAccessFlow from a door handle or window switch to a door or window that has moved and, for a door, is latched again.

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
