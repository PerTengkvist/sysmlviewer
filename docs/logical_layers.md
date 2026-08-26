# Logical architecture — four layers

The data center model uses **four layers**. Layers 1–3 live under `logical/`; layer 4 is `physical/`.

| Layer | Name | Package / parts | Role |
|-------|------|-----------------|------|
| **1** | Control plane | `Orchestrator`, `MonitoringAndSupervision` | Policy, desired state, observability |
| **2** | Workload plane | `KubernetesCluster` | Virtual K8s: compute×N, storage, network @ `k8n_vlan` |
| **3** | Substrate plane | `InfrastructurePlatform`, `ResourcePool` | Logical CPU/RAM/storage/network capacity; IaaC provisioning |
| **4** | Physical | `DataCenterSite`, `ServerBlade`, … | Vendor-specific hardware (cores, GB, NIC model) |

## Layer 3 — logical substrate (not vendor-specific)

`SubstrateResourcesPkg` defines capacity **before** a manufacturer is chosen:

- `LogicalCpu` — `cores` (e.g. 32), not “Intel Xeon …”
- `LogicalRam` — `capacityGB`
- `LogicalStorageVolume` — `capacityTB`
- `LogicalNetworkSegment` — `bandwidthGbps`

Aggregated in `ResourcePool` (`cpus`, `memory`, `storage`, `network` pools).

`InfrastructurePlatform` owns `pool` + `engine` (ProvisioningEngine) and exposes IaaC northbound ports (`iaac_sap`, `iaac_scp`, `iaac_smp`, `iaac_spp`).

## Layer 2 — workload consumes substrate

Each virtual plane has a **slice** bound via `iaac_spi`:

| Part | Slice | Substrate |
|------|-------|-----------|
| `ComputeEngine` | `ComputeSlice` | `LogicalCpu` + `LogicalRam` |
| `StoragePlane` | `StorageSlice` | `LogicalStorageVolume` |
| `NetworkPlane` | `NetworkSlice` | `LogicalNetworkSegment` |

`KubernetesCluster.iaac_rpp` receives provision from `iaac.iaac_spp` and fans out to `compute.slice.rpp`, `storage.slice.rpp`, `network.slice.rpp`.

Intra-cluster interfaces: peer ports `smp` / `scp` / `sdp` (see [kubernetes_cluster_interfaces.md](kubernetes_cluster_interfaces.md)).

## Layer 1 — control

- Orchestrator → cluster (`cluster_rap/rcp` → `cluster_sap/scp`)
- Orchestrator → IaaC (`iaac_rap/rcp` → `iaac_sap/scp`)
- Monitoring → `*_rmp` → `*_smp` on cluster, orchestrator, IaaC

## Layer 4 — physical allocation

`physical/data_center_physical.sysml` maps logical substrate and workload ports to blades, NAS, switches (AllocationView). Example:

- `logical.iaac.pool.cpus` → `bladeCompute.cpu`
- `logical.cluster.compute.slice.cpu` → `bladeCompute.cpu`
- Vendor attributes (`Cpu.cores`, NIC speed) live only in layer 4.

## File map

| File | Layer |
|------|-------|
| `logical/data_center_logical.sysml` | 1–3 assembly |
| `logical/orchestrator.sysml` | 1 |
| `logical/monitoring.sysml` | 1 |
| `logical/kubernetes_cluster.sysml` | 2 |
| `logical/substrate_resources.sysml` | 3 |
| `logical/infrastructure_platform.sysml` | 3 |
| `physical/data_center_physical.sysml` | 4 |
