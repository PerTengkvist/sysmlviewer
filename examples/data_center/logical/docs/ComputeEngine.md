# ComputeEngine

Logical **compute plane** (worker/control workloads).

## Interfaces

| Port | Kind | Role |
|------|------|------|
| compute_sap | API | Northbound compute API |
| compute_scp | control | Control channel |
| compute_smp | metrics | Telemetry export |
| compute_svp | compute | Virtualization/compute fabric |

## Allocation

Mapped to compute blade (`bladeCompute`): API→Ethernet, control/metrics→management, compute→CPU fabric.
