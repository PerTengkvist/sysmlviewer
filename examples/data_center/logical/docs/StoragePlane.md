# StoragePlane

Logical **persistent storage plane** (PV/Ceph/NAS abstraction).

## Interfaces

| Port | Kind | Role |
|------|------|------|
| storage_ssp | storage | Storage service |
| storage_scp | control | Control |
| storage_smp | metrics | Metrics |

## Allocation

Mapped to `nas` (NetworkStorage): service→Ethernet, control/metrics→management.
