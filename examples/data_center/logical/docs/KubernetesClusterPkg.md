# KubernetesClusterPkg

Package defining the **logical Kubernetes cluster** and its planes.

## Contents

- `ComputeEngine`, `StoragePlane`, `NetworkPlane` — functional planes
- `KubernetesCluster` — composition with aggregate cluster ports and relay ports to planes
- `KubernetesClusterView` — diagram exposing the cluster
