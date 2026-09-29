# CarLogicalView

**GeneralView** exposing the conceptual car `Car`.

## Purpose

A conceptual car is described here as a set of **logical resources** (parts) with **dependencies** between them — without port wiring or physical realization.

## Logical resources

| Part | Role |
|------|------|
| `chassis` | Structural frame that other resources depend on |
| `engine` | Motive power source |
| `transmission` | Power transfer between engine and axles |
| `steeringWheel` | Steering control |
| `frontAxle` / `rearAxle` | Wheel axles |
| `brakes` | Braking system |

## Dependencies

Dashed dependency edges show soft “depends on” relations. Prefix metadata keywords (`#Mount`, `#Driveline`, …) appear on the edge as guillemet labels such as **«Mount»**.

Examples:

- engine, transmission, steering wheel, axles, and brakes **depend on** the chassis (`«Mount»`)
- transmission **depends on** the engine (`«Driveline»`)
- front axle **depends on** the transmission (`«Drive»`)
- brakes **depend on** the axles (`«Actuation»`)

Use this view to explain the car’s logical resource structure before introducing detailed interfaces or physical allocation.
