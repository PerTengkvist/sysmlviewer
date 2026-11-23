# DriverFeedback

Tell the driver on the instrument cluster what the car is doing: power mode, gear, speed, beam, doors, set temperature, state of charge and warnings. Many use cases end with such an indication, so their steps are realized by a step of another function together with a step of DriverFeedback. It is a function of its own, and depends on no other function, because the cluster runs on 12 V and shows the locked car too: a broken cluster takes away the indications, not the car. Named after the DriverFeedback interface the cluster consumes. Four flows, one per kind of indication: driverFeedbackFlow for driving, powerModeFlow, cabinStatusFlow and chargeStatusFlow.

Part of `Functions`.

## Relations

- Refines `StartVehicle`.
- Refines `StopVehicle`.
- Refines `ChangeGear`.
- Refines `Accelerate`.
- Refines `ToggleHeadlights`.
- Refines `OpenDoor`.
- Refines `CloseDoor`.
- Refines `AdjustClimate`.
- Refines `Charge`.

## Diagrams

- `FunctionsView`
- `FunctionAllocationView`
