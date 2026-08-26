private import LogicalPorts::*;

package OrchestratorPkg {
  // Workload / service orchestration above the cluster API

  part def Orchestrator {
    // Northbound: provided API (S = orchestrator)
    port orchestrator_sap : orchestrator_sai;
    port orchestrator_scp : orchestrator_sci;
    port orchestrator_smp : orchestrator_smi;
    // Southbound: one U-port per S part-name (no fan-out)
    port cluster_rap : cluster_sai;
    port cluster_rcp : cluster_sci;
    port iaac_rap : iaac_sai;
    port iaac_rcp : iaac_sci;
    attribute scope : String = "workloads-and-services";
  }

  view def OrchestratorView : GeneralView {
    expose Orchestrator;
  }

  attribute def String;
}
