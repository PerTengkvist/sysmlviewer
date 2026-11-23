# StartVehicle

The driver presses the start button with the brake held. The car authenticates the key, releases the immobilizer, closes the high-voltage contactor and shows Ready. Starting is where the immobilizer requirement is met: the car becomes Ready only once the key has been approved. Without the brake held, or without an approved key in the cabin, the car stays Off and tells the driver why.

## Relations

- Refined by `StartVehicleSequence`.
- Refined by `Security`.
- Refined by `authenticate`.
- Refined by `immobilizer`.
- Refined by `driverInformation`.
- Refined by `DriverFeedback`.
- Refined by `powerControl`.
- Pursues requirement `PowerModes`.
- Pursues requirement `Immobilizer`.
- Included by `Drive`.
- Refines `DriveToDestination`.
