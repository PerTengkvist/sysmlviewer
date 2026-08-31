# NetworkPlane

Logical **CNI / overlay network plane**.

## Interfaces

| Port | Type | Role |
|------|------|------|
| `smp` | `network_smi` | Metrics |
| `scp` | `network_sci` | Control |
| `e_nwdp` | `k8n_vlan` | External dataplane (north/south, cluster edge) |
| `i_nwdp` | `k8n_vlan` | Internal fabric for compute and storage `nwdp` attachments |

## Allocation

Mapped to `torSwitch`: control/metrics→management, `e_nwdp` (and substrate segment)→downlink.
