# Orchestrator

Logical **orchestrator** coordinating cluster and IaaC.

## Interfaces

Provides orchestrator API/control/metrics; consumes cluster and IaaC APIs via `cluster_rap/rcp` and `iaac_rap/rcp`.

## Allocation

Primarily hosted on `bladeControl` (control-plane blade); northbound API also reaches `edgeRouter.lan` via DataCenter-level exposure.
