private import LogicalPorts::*;
private import KubernetesClusterPkg::*;
private import OrchestratorPkg::*;
private import MonitoringPkg::*;
private import InfrastructurePlatformPkg::*;

package DataCenterLogical {
  // Four logical layers (vendor-neutral until physical allocation):
  //
  //  Layer 1 — Control plane: orchestrator + monitoring
  //  Layer 2 — Workload plane: KubernetesCluster (virtual compute/storage/network)
  //  Layer 3 — Substrate plane: InfrastructurePlatform + ResourcePool (logical CPU/RAM/…)
  //  Layer 4 — Physical: data_center_physical.sysml (vendor-specific Cpu, Ram, blades, …)

  part def DataCenter {
    // --- Layer 1: Control plane ---
    part orchestrator : Orchestrator;
    part monitoring : MonitoringAndSupervision;

    // --- Layer 2: Workload plane ---
    part cluster : KubernetesCluster;

    // --- Layer 3: Substrate / IaaC ---
    part iaac : InfrastructurePlatform;

    // Layer 1 northbound (DataCenter as consumer of orchestrator API)
    port orchestrator_rap : orchestrator_sai;
    port monitoring_rcp : monitoring_sci;

    connection orchestrator_sai
      connect orchestrator_rap to orchestrator.orchestrator_sap;

    // Layer 1 → Layer 2 (orchestrator drives cluster)
    connection cluster_sai
      connect orchestrator.cluster_rap to cluster.cluster_sap;
    connection cluster_sci
      connect orchestrator.cluster_rcp to cluster.cluster_scp;

    // Layer 1 → Layer 3 (orchestrator drives IaaC)
    connection iaac_sai
      connect orchestrator.iaac_rap to iaac.iaac_sap;
    connection iaac_sci
      connect orchestrator.iaac_rcp to iaac.iaac_scp;
    connection orchestrator_sci
      connect iaac.orchestrator_rcp to orchestrator.orchestrator_scp;

    // Layer 3 → Layer 2 (IaaC provisions virtual cluster substrate)
    connection iaac_spi
      connect iaac.iaac_spp to cluster.iaac_rpp;

    // Layer 1 monitoring → Layers 2 & 3
    connection cluster_smi
      connect monitoring.cluster_rmp to cluster.cluster_smp;
    connection orchestrator_smi
      connect monitoring.orchestrator_rmp to orchestrator.orchestrator_smp;
    connection iaac_smi
      connect monitoring.iaac_rmp to iaac.iaac_smp;
    connection monitoring_sci
      connect monitoring_rcp to monitoring.monitoring_scp;
  }

  view def DataCenterLogicalView : GeneralView {
    expose DataCenter;
  }

  view def DataCenterLogicalTree : TreeView {
    expose DataCenter;
  }
}
