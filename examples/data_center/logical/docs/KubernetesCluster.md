# KubernetesCluster

Logical **cluster aggregate** composing compute, storage, and network planes.

## Northbound

Exposes `cluster_sap/scp/smp` and relays plane APIs via `compute_rap`, `storage_rsp`, `network_rnp`, etc.

## Allocation

Aggregate API/control→control blade; cluster metrics→ToR switch; IaaC provision relay→edge router management.
