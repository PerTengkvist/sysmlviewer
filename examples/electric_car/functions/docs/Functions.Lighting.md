# Lighting

Headlamps, tail lamps, brake lamps, direction indicators and hazard lights. Three flows, one per trigger: lightingFlow for the light switch, indicatorFlow for a turn or a hazard, and brakeLampFlow for the brake pedal. Depends on Security and Charging. Indicators also depend on Maneuvrability because they follow the intended turn.

Part of `Functions`.

## Relations

- Depends on `Security` («Authorize»).
- Depends on `Charging` («Energy»).
- Depends on `Maneuvrability` («Indicate»).
- Refines `ToggleHeadlights`.
- Refines `TurnLeft`.
- Refines `TurnRight`.
- Refines `Brake`.
- Refines `EmergencyStop`.

## Diagrams

- `FunctionsView`
- `FunctionAllocationView`
