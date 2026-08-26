# DataCenterLogical

Top-level **logical architecture package** for the data center.

## Purpose

Composes the four pillars of platform logic—Kubernetes cluster, orchestrator, monitoring, and IaaC—into a single `DataCenter` part with northbound orchestrator API exposure.

## Key artifact

- `DataCenter` — aggregates `cluster`, `orchestrator`, `monitoring`, and `iaac` with control/metrics wiring between them.

## Views in this package

- `DataCenterLogicalView` — interconnection diagram of the logical stack
- `DataCenterLogicalTree` — hierarchical tree of logical parts
