# MonitoringAndSupervision

Logical **monitoring** service collecting metrics and control from cluster, orchestrator, and IaaC.

## Notable ports

- `monitoring_sap/scp/smp` — monitoring service interfaces
- `cluster_rmp`, `orchestrator_rmp`, `iaac_rmp` — metrics sinks per domain
- `logsIn` — optional log intake

## Allocation

Metrics paths→ToR switch and control blades; API→control blade Ethernet; IaaC metrics→edge router mgmt.
