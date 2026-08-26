# Kubernetes cluster — port and interface naming

## Problem

Inside `KubernetesCluster`, compute / storage / network are **peer planes at the same logical layer**. The cross-layer **S/U policy** (`sap`/`rap`, `scp`/`rcp`, …) assumes a service provider and a distinct consumer. That fits DataCenter topology (orchestrator → cluster) but breaks inside the cluster:

- Connections like `cluster_sap : cluster_sai` → `compute_rap : compute_sai` are **type mismatches** (`cluster_sai` ≠ `compute_sai`).
- Resource ports (`*_r*p`) on the composite shell duplicate child interfaces without matching types.

## Two naming regimes

| Scope | Parts | Port naming | When |
|-------|-------|-------------|------|
| **Cross-layer** | orchestrator, cluster, monitoring, iaac | S/U policy (`<S>_sap`, `<S>_rap`, …) | Different roles: provider vs consumer |
| **Intra-cluster** | compute, storage, network | **Peer ports** (`smp`, `scp`, `sdp`) | Same layer; symmetric composition |

## Intra-cluster peer ports (per plane part def)

| Plane role | Port name | Interface type (`port def`) | Purpose |
|------------|-----------|----------------------------|---------|
| Management / observability | `smp` | `<plane>_smi` | Metrics, health, supervision hooks |
| Control / configuration | `scp` | `<plane>_sci` | Operate and configure the plane |
| Dataplane | `sdp` | `k8n_vlan` | IP/VLAN payload fabric (CNI overlay) |

Examples on `ComputeEngine`:

```sysml
port smp : compute_smi;
port scp : compute_sci;
port sdp : k8n_vlan;
```

`k8n_vlan` is **one shared interface type** for all dataplane attachments inside the cluster (pod network, storage I/O path, east-west traffic).

## KubernetesCluster composite shell

**Northbound** (unchanged S/U at DataCenter boundary):

```sysml
port cluster_sap : cluster_sai;
port cluster_scp : cluster_sci;
port cluster_smp : cluster_smi;
port iaac_rpp : iaac_spi;
```

**Internal delegation** — ports typed to match the child plane (not `*_r*p`):

```sysml
port compute_scp : compute_sci;
port compute_smp : compute_smi;
port compute_sdp : k8n_vlan;
// … storage_*, network_* similarly
```

Connections use **identical types on both ends**:

```sysml
connection compute_sci connect compute_scp to compute.scp;
connection k8n_mesh connect compute_sdp to network.sdp;
```

Do **not** connect `cluster_sci` to `compute_sci` in the same connection — orchestrator → cluster is modeled in `DataCenterLogical`; cluster → compute control is a separate typed delegation.

## API (`*_sai`) scope

The workload **API** is exposed only at the **cluster northbound** face (`cluster_sap : cluster_sai`). Plane parts do not expose `sap`/`sai`; orchestrator reaches compute/storage/network through the cluster API or control/dataplane paths above.

## Substrate slices (layer 3 → layer 2)

Each plane owns a **slice** provisioned from IaaC:

| Plane | Slice | Logical substrate |
|-------|-------|-------------------|
| `ComputeEngine` | `ComputeSlice` | `LogicalCpu` + `LogicalRam`, `rpp : iaac_spi` |
| `StoragePlane` | `StorageSlice` | `LogicalStorageVolume`, `rpp : iaac_spi` |
| `NetworkPlane` | `NetworkSlice` | `LogicalNetworkSegment`, `rpp : iaac_spi` |

`KubernetesCluster.iaac_rpp` receives `iaac.iaac_spp` at the DataCenter level and distributes provision to each slice. See [logical_layers.md](logical_layers.md).
