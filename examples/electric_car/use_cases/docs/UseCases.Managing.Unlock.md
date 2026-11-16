# Unlock

The driver presses unlock on the key fob. The car authenticates the credential, releases the latches, flashes the indicators and wakes the cabin. A key the car does not recognise is rejected and the car stays locked.

## Relations

- Refined by `Security`.
- Refined by `authenticate`.
- Refined by `wakeUp`.
- Refined by `lockControl`.
- Pursues requirement `AccessControl`.
- Refines `ParkAndLeave`.
