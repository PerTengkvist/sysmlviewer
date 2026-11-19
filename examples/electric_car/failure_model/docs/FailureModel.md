# FailureModel

Small reusable library for failure-impact analysis. A failure mode is a FailureKind. The metadata keywords tell the analysis how instances of a part combine: Single (all needed, the default), Pool (instance capacities add up, with a minimum required), Redundant (k of n, k given by the required attribute) and Soft (on a dependency: degrades the dependent function instead of losing it).

## Contents

- `FailureKind`: loss, degraded, erroneous.
- `#Single`: all instances are needed (default).
- `#Pool`: instance capacities add up; the pool is lost when the surviving capacity is below `required`.
- `#Redundant`: k of n instances are needed, k given by `required` (or `<name>Required`).
- `#Soft`: on a dependency, degrades the dependent function instead of losing it.
