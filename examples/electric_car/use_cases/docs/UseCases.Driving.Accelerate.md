# Accelerate

The driver presses the accelerator and the motor delivers torque within the battery's limit. The same use case carries the car up to its top speed, so it pursues both the acceleration and the top-speed requirement. With a cold or nearly empty battery the car delivers less torque and says so.

## Relations

- Refined by `AccelerateSequence`.
- Refined by `SpeedControl`.
- Refined by `torqueArbitration`.
- Refined by `tractionDrive`.
- Refined by `DriverFeedback`.
- Refined by `driverInformation`.
- Pursues requirement `Acceleration`.
- Pursues requirement `TopSpeed`.
- Included by `Drive`.
- Refines `ControlSpeed`.
