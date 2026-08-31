# Logical architecture — four layers

The data center model uses **four layers**. Layers 1–3 live under `logical/`; layer 4 is `physical/`.

| Layer | Name | Package / parts | Role |
|-------|------|-----------------|------|
| **1** | Control plane | `Orchestrator`, `MonitoringAndSupervision` | Policy, desired state, observability |
| **2** | Workload plane | `KubernetesCluster` | Virtual K8s: compute×N, storage, network (`nwdp` / `e_nwdp` / `i_nwdp`) |
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

Intra-cluster interfaces: peer ports `smp` / `scp`, plus `sdp` (execution or logical I/O) and `nwdp` / `e_nwdp` / `i_nwdp` for the fabric (see [kubernetes_cluster_interfaces.md](kubernetes_cluster_interfaces.md)).

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

## Part relationship types (SysML v2 subset)

Use the right relation for the semantics you need in `GeneralView`:

| Relation | SysML syntax | Use when |
|----------|--------------|----------|
| **connection** | `connection … connect portA to portB` | Structural/interface coupling between ports (control, data, power). Used throughout layers 1–4, e.g. orchestrator → cluster in `data_center_logical.sysml`. |
| **dependency** | `dependency from A to B` | Soft “depends on” between parts without port wiring — e.g. a workload part that requires a platform service but does not expose a dedicated port pair. |
| **allocation** | `allocate logicalPart to physicalPart` | Maps logical capacity or workload to physical realization. Layer 4 uses port-level `connection` with `alloc*` names today; prefer explicit `allocate` for new logical→physical links. |
| **binding** | `bind attrA = attrB` | Same value/reference on two features (e.g. aggregate temperature equals sensor reading). |
| **flow** | `flow … from portA to portB` | Directed item/energy flow distinct from a generic connection. |
| **specialization** | `part def X :> Y` | Type hierarchy between part definitions (shown as a diagram edge plus `typeRef`). |
| **subsetting / redefinition** | `part x subsets y` / `part x redefines y` | Restrict or replace inherited features between part usages. |

Reference fixture: `examples/diagrams/part_relationships.sysml` (`RelationshipsView`).
