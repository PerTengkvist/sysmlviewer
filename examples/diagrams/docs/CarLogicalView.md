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

Dashed dependency edges show soft “depends on” relations, for example:

- engine, transmission, steering wheel, axles, and brakes **depend on** the chassis
- transmission **depends on** the engine
- front axle **depends on** the transmission
- brakes **depend on** the axles

Use this view to explain the car’s logical resource structure before introducing detailed interfaces or physical allocation.
