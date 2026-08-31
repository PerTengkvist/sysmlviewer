private import LogicalPorts::*;

package MonitoringPkg {
  // Monitoring and supervision of logical services

  part def MonitoringAndSupervision {
    port monitoring_sap : monitoring_sai;
    port monitoring_scp : monitoring_sci;
    port monitoring_smp : monitoring_smi;
    // One metrics U-port per S part-name (no fan-out)
    port cluster_rmp : cluster_smi;
    port orchestrator_rmp : orchestrator_smi;
    port iaac_rmp : iaac_smi;
    port logsIn : LogPort;
    attribute scope : String = "observability-and-supervision";
  }

  view def MonitoringView : GeneralView {
    expose MonitoringAndSupervision;
  }

  attribute def String;
}
