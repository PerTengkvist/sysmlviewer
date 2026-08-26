# DataCenter

Root **logical part** representing the abstract data-center platform.

## Role

Aggregates cluster, orchestrator, monitoring, and IaaC. Exposes northbound orchestrator API (`orchestrator_rap`) and accepts monitoring control (`monitoring_rcp`).

## What you see in diagrams

In `DataCenterLogicalView`, `DataCenter` appears as the enclosing part with internal connections wiring orchestrator ↔ cluster/iaac/monitoring control and metrics paths.

## Physical allocation

Embedded in `DataCenterSite` as the `logical` part; allocation connections map its sub-services to blades, NAS, switch, and router.
