# InfrastructurePlatform

Logical **IaaC platform** for declarative provisioning.

## Interfaces

- `iaac_spp` — provision southbound toward cluster
- `iaac_sap/scp/smp` — API, control, metrics
- `orchestrator_rcp` — peer control with orchestrator

## Allocation

Provisioning→edge router mgmt; API/control/metrics→control blade; orchestrator peer control→control blade mgmt.
