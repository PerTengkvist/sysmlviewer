# KubernetesCluster

Logical **cluster aggregate** composing compute, storage, and network planes.

## Northbound

Exposes `cluster_sap` / `cluster_scp` / `cluster_smp` toward orchestrator and monitoring, plus `iaac_rpp` for substrate provision from IaaC.

## Plane faces (delegated)

| Cluster port | Plane port | Meaning |
|--------------|------------|---------|
| `compute_sdp` | `compute.sdp` | Runtime / container execution interface |
| `storage_sdp` | `storage.sdp` | Logical storage write/attach API |
| `network_sdp` | `network.e_nwdp` | External (north/south) network dataplane |

## Internal network fabric

Compute and storage attach to the cluster fabric with `nwdp` → `network.i_nwdp`.

Writing through `storage_sdp` is a **logical** attach point. Payload traffic actually flows:

`compute.nwdp` → `network.i_nwdp` → `storage.nwdp`

## Allocation

Aggregate API/control→control blade; cluster metrics→ToR switch; IaaC provision relay→edge router management. See plane docs and the AllocationView for dataplane mapping.
