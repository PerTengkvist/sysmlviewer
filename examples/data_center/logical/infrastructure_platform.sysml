private import LogicalPorts::*;
private import SubstrateResourcesPkg::*;

package InfrastructurePlatformPkg {
  // Layer 3 — Substrate / IaaC (Terraform-like provisioning of logical capacity)

  part def ProvisioningEngine {
    attribute tool : String = "declarative-iaac";
    attribute description : String = "Applies declarative config to slice logical capacity from the pool";
  }

  part def InfrastructurePlatform {
    part pool : ResourcePool;
    part engine : ProvisioningEngine;

    port iaac_sap : iaac_sai;
    port iaac_scp : iaac_sci;
    port iaac_smp : iaac_smi;
    port iaac_spp : iaac_spi;
    port orchestrator_rcp : orchestrator_sci;
    attribute approach : String = "declarative-iaac";

    connection pool_control
      connect iaac_scp to pool.scp;
    connection pool_metrics
      connect iaac_smp to pool.smp;
  }

  view def InfrastructurePlatformView : GeneralView {
    expose InfrastructurePlatform;
  }

  view def ResourcePoolView : GeneralView {
    expose ResourcePool;
  }
}
