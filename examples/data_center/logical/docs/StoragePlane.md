# StoragePlane

Logical **persistent storage plane** (PV / Ceph / NAS abstraction).

## Interfaces

| Port | Type | Role |
|------|------|------|
| `smp` | `storage_smi` | Metrics |
| `scp` | `storage_sci` | Control |
| `sdp` | `storage_ssi` | Logical write/attach API (what workloads “write to”) |
| `nwdp` | `k8n_vlan` | Actual I/O path on the cluster fabric (`network.i_nwdp`) |

Storage traffic presented at `storage_sdp` / `sdp` is conceptual. Bytes move via compute `nwdp` through the network plane to storage `nwdp`.

## Allocation

Mapped to `nas` (NetworkStorage): control/metrics→management, `nwdp`→Ethernet.
