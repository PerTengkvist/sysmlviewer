# NetworkPlane

Logical **CNI / overlay network plane**.

## Interfaces

| Port | Kind | Role |
|------|------|------|
| network_snp | network | Network service |
| network_scp | control | Control |
| network_smp | metrics | Metrics |

## Allocation

Mapped to `torSwitch`: service→downlink, control/metrics→management.
