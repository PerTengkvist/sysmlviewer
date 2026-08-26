# Interface naming policy (S_entity / U_entity)

Logical service interfaces follow a fixed suffix scheme so **service** (S) and **resource/using** (U) roles are visible in names.

## Suffix table

| Kind | Type (`*_s?i`) | S-port (`*_s?p`) | U-port (`*_r?p`) | Connection default |
|------|----------------|------------------|------------------|--------------------|
| control | `<S>_sci` | `<S>_scp` | `<S>_rcp` / `<U>_<A\|_B>_rcp` | `<S>_sci` |
| api | `<S>_sai` | `<S>_sap` | `<S>_rap` / `<U>_<A\|_B>_rap` | `<S>_sai` |
| metrics | `<S>_smi` | `<S>_smp` | `<S>_rmp` / … | `<S>_smi` |
| provision | `<S>_spi` | `<S>_spp` | `<S>_rpp` / … | `<S>_spi` |
| storage service | `<S>_ssi` | `<S>_ssp` | `<S>_rsp` / … | `<S>_ssi` |
| network service | `<S>_sni` | `<S>_snp` | `<S>_rnp` / … | `<S>_sni` |
| compute service | `<S>_svi` | `<S>_svp` | `<S>_rvp` / … | `<S>_svi` |

- `s` = service (providing), `r` = resource (using). The middle letter (`c`/`a`/`m`/…) selects kind.
- **S_entity** token is normally the part def’s simple name (e.g. `KubernetesCluster`). In `data/projects/data_center` the token is the **part usage name** instead (`cluster`, `iaac`, `orchestrator`, …).
- **1:1** U-port: `<S>_r?p`. **Several** ports of the same kind on one U: `<U>_<A|B>_r?p`.
- One U-port must not fan out to several different S APIs; use one `r*p` per S_entity.

## Tooling

- Domain helpers: `backend/src/domain/interface_naming.py`.
- Creating a connection without a name defaults to `<S>_*i` when endpoints match the policy (else `connN`).
- Creating a port with a `*_s?i` typeRef and no name defaults to `*_s?p` on the S part, otherwise `*_r?p`.
- After reparse, soft warnings are attached to files when names diverge from the policy (load is not blocked).

## Example (data center)

See `data/projects/data_center/logical/` — e.g. `orchestrator_sap : orchestrator_sai`, `cluster_rap : cluster_sai`, connection `cluster_sai` (`iaac_smp` on the IaaC part, not `InfrastructurePlatform_smp`).

### Intra-cluster peer ports

Inside `KubernetesCluster`, compute / storage / network use **peer port names** (`smp`, `scp`, `sdp`) instead of S/U suffixes. See [kubernetes_cluster_interfaces.md](kubernetes_cluster_interfaces.md).

### Four logical layers

Control, workload, substrate, and physical allocation are described in [logical_layers.md](logical_layers.md). Substrate capacity (`LogicalCpu`, pools, …) lives in layer 3; vendor hardware in layer 4 (`physical/`).
