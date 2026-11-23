# Park

The driver stops, selects park, shuts the car down and locks it. Includes StopVehicle and Lock. Its own two steps are the driver's, so the car's part of parking is realized through the use cases it includes; the P on the cluster is shown by ChangeGear.

## Relations

- Refined by `ParkSequence`.
- Pursues requirement `LockIndication`.
- Includes `StopVehicle`.
- Includes `Lock`.
- Refines `ParkAndLeave`.
