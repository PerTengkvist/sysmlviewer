# ComputeEngine

Logical **compute plane** (worker/control workloads).

## Interfaces

| Port | Type | Role |
|------|------|------|
| `smp` | `compute_smi` | Metrics / health |
| `scp` | `compute_sci` | Control / configuration |
| `sdp` | `compute_svi` | Runtime face — containers and other execution components attach here |
| `nwdp` | `k8n_vlan` | Cluster-internal network attachment (wired to `network.i_nwdp`) |

## Allocation

Mapped to compute blade (`bladeCompute`): control/metrics→management, `sdp`→CPU fabric, `nwdp`→Ethernet.
