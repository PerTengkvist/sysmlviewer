# SpeedControl

Command traction torque and braking, including regenerative braking, so the driver can set and hold speed. Depends on Security for the immobilizer and on Charging for energy.

## Relations

- Depends on `Security` («Authorize»).
- Depends on `Charging` («Energy»).
- `Maneuvrability` depends on this («Stability»).
- `WindshieldCleaning` depends on this («Speed»).

## Diagrams

- `FunctionsView`
