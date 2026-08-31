# KubernetesClusterView

**GeneralView** exposing `KubernetesCluster`.

## What you see

All three planes (compute, storage, network) inside the cluster part, cluster-level ports, and internal connections:

- Control / metrics delegation (`*_scp`, `*_smp`)
- Execution and logical I/O faces (`compute_sdp` → `compute.sdp`, `storage_sdp` → `storage.sdp`)
- Internal fabric (`compute.nwdp` / `storage.nwdp` → `network.i_nwdp`)
- External dataplane (`network_sdp` → `network.e_nwdp`)

Use this view to understand how orchestrator-facing cluster ports reach individual planes, and how storage I/O is modeled as a logical `sdp` while the real path goes through the network fabric.
