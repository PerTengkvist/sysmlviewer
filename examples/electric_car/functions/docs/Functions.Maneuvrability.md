# Maneuvrability

Steer the car left and right, select the direction of travel, and keep it directionally stable. Two flows, one per trigger: maneuvrabilityFlow from the steering wheel to the road wheels, and gearSelectionFlow from the gear selector to a gear that is engaged or refused. Depends on Security, and on SpeedControl because steering response and gear changes depend on speed.

Part of `Functions`.

## Relations

- Depends on `Security` («Authorize»).
- Depends on `SpeedControl` («Stability»).
- `Lighting` depends on this («Indicate»).
- Refines `ChangeGear`.
- Refines `TurnLeft`.
- Refines `TurnRight`.

## Diagrams

- `FunctionsView`
- `FunctionAllocationView`
