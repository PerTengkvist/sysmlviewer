# Kubernetes cluster — port and interface naming

## Problem

Inside `KubernetesCluster`, compute / storage / network are **peer planes at the same logical layer**. The cross-layer **S/U policy** (`sap`/`rap`, `scp`/`rcp`, …) assumes a service provider and a distinct consumer. That fits DataCenter topology (orchestrator → cluster) but breaks inside the cluster:

- Connections like `cluster_sap : cluster_sai` → `compute_rap : compute_sai` are **type mismatches** (`cluster_sai` ≠ `compute_sai`).
- Resource ports (`*_r*p`) on the composite shell duplicate child interfaces without matching types.

## Two naming regimes

| Scope | Parts | Port naming | When |
|-------|-------|-------------|------|
| **Cross-layer** | orchestrator, cluster, monitoring, iaac | S/U policy (`<S>_sap`, `<S>_rap`, …) | Different roles: provider vs consumer |
| **Intra-cluster** | compute, storage, network | **Peer ports** (`smp`, `scp`, `sdp`, `nwdp`, …) | Same layer; symmetric composition |

## Intra-cluster peer ports

### Shared management / control (all planes)

| Plane role | Port name | Interface type | Purpose |
|------------|-----------|----------------|---------|
| Management / observability | `smp` | `<plane>_smi` | Metrics, health, supervision hooks |
| Control / configuration | `scp` | `<plane>_sci` | Operate and configure the plane |

### ComputeEngine

```sysml
port smp : compute_smi;
port scp : compute_sci;
port sdp : compute_svi;   // containers / runtime execution
port nwdp : k8n_vlan;     // attach to NetworkPlane.i_nwdp
```

### StoragePlane

```sysml
port smp : storage_smi;
port scp : storage_sci;
port sdp : storage_ssi;   // logical write / PV attach face
port nwdp : k8n_vlan;     // real I/O path on the fabric
```

### NetworkPlane

```sysml
port smp : network_smi;
port scp : network_sci;
port e_nwdp : k8n_vlan;   // external (north/south) dataplane
port i_nwdp : k8n_vlan;   // internal fabric for plane nwdp ports
```

`k8n_vlan` remains the shared **network dataplane** type for `nwdp` / `e_nwdp` / `i_nwdp`. Compute/storage **`sdp`** ports use domain types (`compute_svi`, `storage_ssi`) because they are not fabric attachments.

## Data path for storage I/O

`storage_sdp` / `storage.sdp` is the **logical** port a workload writes to. Payload traffic is modeled on the fabric:

```text
compute.nwdp ──► network.i_nwdp ──► storage.nwdp
```

## KubernetesCluster composite shell

**Northbound** (unchanged S/U at DataCenter boundary):

```sysml
port cluster_sap : cluster_sai;
port cluster_scp : cluster_sci;
port cluster_smp : cluster_smi;
port iaac_rpp : iaac_spi;
```

**Internal delegation** — ports typed to match the child plane:

```sysml
port compute_scp : compute_sci;
port compute_smp : compute_smi;
port compute_sdp : compute_svi;
port storage_scp : storage_sci;
port storage_smp : storage_smi;
port storage_sdp : storage_ssi;
port network_scp : network_sci;
port network_smp : network_smi;
port network_sdp : k8n_vlan;   // → network.e_nwdp
```

Connections (identical types on both ends):

```sysml
connection compute_svi connect compute_sdp to compute.sdp;
connection storage_ssi connect storage_sdp to storage.sdp;
connection compute_nwdp connect compute.nwdp to network.i_nwdp;
connection storage_nwdp connect storage.nwdp to network.i_nwdp;
connection network_e_nwdp connect network_sdp to network.e_nwdp;
```

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
