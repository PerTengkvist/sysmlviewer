private import LogicalPorts::*;
private import SubstrateResourcesPkg::*;

package KubernetesClusterPkg {
  // Layer 2 — Workload plane (virtual K8s cluster)
  //
  // Each plane consumes substrate via ComputeSlice / StorageSlice / NetworkSlice (iaac_spi).
  // Intra-cluster peer ports: smp, scp, sdp (see docs/kubernetes_cluster_interfaces.md).

  part def ComputeSlice {
    part cpu : LogicalCpu;
    part ram : LogicalRam;
    port rpp : iaac_spi;
    attribute nodeRole : String = "worker";

    connection slice_cpu
      connect rpp to cpu.scp;
    connection slice_ram
      connect rpp to ram.scp;
  }

  part def StorageSlice {
    part volume : LogicalStorageVolume;
    port rpp : iaac_spi;
  }

  part def NetworkSlice {
    part segment : LogicalNetworkSegment;
    port rpp : iaac_spi;

    connection slice_segment
      connect rpp to segment.scp;
  }

  part def ComputeEngine {
    part slice : ComputeSlice;
    port smp : compute_smi;
    port scp : compute_sci;
    port sdp : k8n_vlan;
    attribute role : String = "worker-and-control-plane";
  }

  part def StoragePlane {
    part slice : StorageSlice;
    port smp : storage_smi;
    port scp : storage_sci;
    port sdp : k8n_vlan;
    attribute backend : String = "persistent-volume";
  }

  part def NetworkPlane {
    part slice : NetworkSlice;
    port smp : network_smi;
    port scp : network_sci;
    port sdp : k8n_vlan;
    attribute cni : String = "overlay";
  }

  part def KubernetesCluster {
    part compute [0..*] : ComputeEngine;
    part storage [0..*] : StoragePlane;
    part network : NetworkPlane;

    // Northbound — S/U at DataCenter boundary (layer 1 → layer 2)
    port cluster_sap : cluster_sai;
    port cluster_scp : cluster_sci;
    port cluster_smp : cluster_smi;

    // Substrate provision intake (layer 3 → layer 2)
    port iaac_rpp : iaac_spi;

    // Internal delegation to plane control/mgmt/dataplan
    port compute_scp : compute_sci;
    port compute_smp : compute_smi;
    port compute_sdp : k8n_vlan;
    port storage_scp : storage_sci;
    port storage_smp : storage_smi;
    port storage_sdp : k8n_vlan;
    port network_scp : network_sci;
    port network_smp : network_smi;
    port network_sdp : k8n_vlan;

    // Distribute substrate provision to virtual planes
    connection provision_compute
      connect iaac_rpp to compute.slice.rpp;
    connection provision_storage
      connect iaac_rpp to storage.slice.rpp;
    connection provision_network
      connect iaac_rpp to network.slice.rpp;

    connection compute_sci
      connect compute_scp to compute.scp;
    connection storage_sci
      connect storage_scp to storage.scp;
    connection network_sci
      connect network_scp to network.scp;

    connection compute_smi
      connect compute_smp to compute.smp;
    connection storage_smi
      connect storage_smp to storage.smp;
    connection network_smi
      connect network_smp to network.smp;

    connection k8n_compute_network
      connect compute_sdp to network.sdp;
    connection k8n_storage_network
      connect storage_sdp to network.sdp;
  }

  view def KubernetesClusterView : GeneralView {
    expose KubernetesCluster;
  }

  attribute def String;
}
