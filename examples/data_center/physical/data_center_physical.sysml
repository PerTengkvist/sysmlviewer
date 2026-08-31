private import PhysicalPorts::*;
private import ServerBladePkg::*;
private import NetworkStoragePkg::*;
private import SwitchPkg::*;
private import RouterPkg::*;
private import CoolingPkg::*;
private import LogicalPorts::*;
private import DataCenterLogical::*;
private import KubernetesClusterPkg::*;
private import OrchestratorPkg::*;
private import MonitoringPkg::*;
private import InfrastructurePlatformPkg::*;
private import SubstrateResourcesPkg::*;

package DataCenterPhysical {
  // Layer 4 — vendor-specific hardware mapped to logical substrate (layer 3) and workload (layer 2).

  part def DataCenterSite {
    part bladeCompute : ServerBlade;
    part bladeControl : ServerBlade;
    part nas : NetworkStorage;
    part torSwitch : Switch;
    part edgeRouter : Router;
    part cooling : Cooling;

    part logical : DataCenter;

    port facilityPower : PowerPort;
    port facilityNetwork : EthernetPort;

    connection bladeAToSwitch connect bladeCompute.eth to torSwitch.downlink;
    connection bladeBToSwitch connect bladeControl.eth to torSwitch.downlink;
    connection nasToSwitch connect nas.eth to torSwitch.downlink;
    connection switchToRouter connect torSwitch.uplink to edgeRouter.lan;
    connection routerWan connect edgeRouter.wan to facilityNetwork;

    connection coolBladeA connect cooling.coolLoop to bladeCompute.cool;
    connection coolBladeB connect cooling.coolLoop to bladeControl.cool;
    connection coolNas connect cooling.coolLoop to nas.cool;
    connection coolSwitch connect cooling.coolLoop to torSwitch.cool;
    connection coolRouter connect cooling.coolLoop to edgeRouter.cool;

    connection pwrBladeA connect facilityPower to bladeCompute.power;
    connection pwrBladeB connect facilityPower to bladeControl.power;
    connection pwrNas connect facilityPower to nas.power;
    connection pwrSwitch connect facilityPower to torSwitch.power;
    connection pwrRouter connect facilityPower to edgeRouter.power;
    connection pwrCool connect facilityPower to cooling.power;

    // --- Layer 3 substrate pool → physical capacity ---
    connection allocPoolCpu
      connect logical.iaac.pool.cpus.cpu.scp to bladeCompute.cpu.fabric;
    connection allocPoolRam
      connect logical.iaac.pool.memory.bank.scp to bladeCompute.ram.bus;

    // --- Layer 2 compute slice → compute blade ---
    connection allocComputeSliceCpu
      connect logical.cluster.compute.slice.cpu.scp to bladeCompute.cpu.fabric;
    connection allocComputeSliceRam
      connect logical.cluster.compute.slice.ram.scp to bladeCompute.ram.bus;
    connection allocComputeCtrl
      connect logical.cluster.compute.scp to bladeCompute.mgmt;
    connection allocComputeMetrics
      connect logical.cluster.compute.smp to bladeCompute.mgmt;
    connection allocComputeExec
      connect logical.cluster.compute.sdp to bladeCompute.cpu.fabric;
    connection allocComputeNetwork
      connect logical.cluster.compute.nwdp to bladeCompute.eth;

    // --- Layer 2 storage slice → NAS ---
    connection allocStorageSliceVol
      connect logical.cluster.storage.slice.volume.scp to nas.eth;
    connection allocStorageCtrl
      connect logical.cluster.storage.scp to nas.mgmt;
    connection allocStorageMetrics
      connect logical.cluster.storage.smp to nas.mgmt;
    connection allocStorageNetwork
      connect logical.cluster.storage.nwdp to nas.eth;

    // --- Layer 2 network slice → ToR ---
    connection allocNetworkSliceSeg
      connect logical.cluster.network.slice.segment.sdp to torSwitch.downlink;
    connection allocNetworkCtrl
      connect logical.cluster.network.scp to torSwitch.mgmt;
    connection allocNetworkMetrics
      connect logical.cluster.network.smp to torSwitch.mgmt;
    connection allocNetworkExternal
      connect logical.cluster.network.e_nwdp to torSwitch.downlink;

    // --- Layer 2 cluster aggregate → control blade / fabric ---
    connection allocClusterApi
      connect logical.cluster.cluster_sap to bladeControl.eth;
    connection allocClusterCtrl
      connect logical.cluster.cluster_scp to bladeControl.mgmt;
    connection allocClusterMetrics
      connect logical.cluster.cluster_smp to torSwitch.mgmt;
    connection allocClusterIaacProv
      connect logical.cluster.iaac_rpp to edgeRouter.mgmt;

    // --- Layer 1 orchestrator ---
    connection allocOrchApi
      connect logical.orchestrator.orchestrator_sap to bladeControl.eth;
    connection allocOrchClusterApi
      connect logical.orchestrator.cluster_rap to bladeControl.mgmt;
    connection allocOrchClusterCtrl
      connect logical.orchestrator.cluster_rcp to bladeControl.mgmt;
    connection allocOrchMetrics
      connect logical.orchestrator.orchestrator_smp to bladeControl.mgmt;
    connection allocOrchIaacApi
      connect logical.orchestrator.iaac_rap to bladeControl.eth;
    connection allocOrchIaacCtrl
      connect logical.orchestrator.iaac_rcp to bladeControl.mgmt;

    // --- Layer 1 monitoring ---
    connection allocMonClusterMetrics
      connect logical.monitoring.cluster_rmp to torSwitch.mgmt;
    connection allocMonCtrl
      connect logical.monitoring.monitoring_scp to bladeControl.mgmt;
    connection allocMonApi
      connect logical.monitoring.monitoring_sap to bladeControl.eth;
    connection allocMonSvcMetrics
      connect logical.monitoring.monitoring_smp to bladeControl.mgmt;
    connection allocMonOrchMetrics
      connect logical.monitoring.orchestrator_rmp to bladeControl.mgmt;
    connection allocMonIaacMetrics
      connect logical.monitoring.iaac_rmp to edgeRouter.mgmt;

    // --- Layer 3 IaaC ---
    connection allocIaacProvision
      connect logical.iaac.iaac_spp to edgeRouter.mgmt;
    connection allocIaacApi
      connect logical.iaac.iaac_sap to bladeControl.eth;
    connection allocIaacMgmt
      connect logical.iaac.iaac_scp to bladeControl.mgmt;
    connection allocIaacMetrics
      connect logical.iaac.iaac_smp to bladeControl.mgmt;
    connection allocIaacOrchCtrl
      connect logical.iaac.orchestrator_rcp to bladeControl.mgmt;

    connection allocExternalApi
      connect logical.orchestrator_rap to edgeRouter.lan;
    connection allocDcMonCtrl
      connect logical.monitoring_rcp to bladeControl.mgmt;
  }

  view def DataCenterPhysicalView : GeneralView {
    expose DataCenterSite;
  }

  view def DataCenterPhysicalTree : TreeView {
    expose DataCenterSite;
  }

  view def AllocationView : AllocationView {
    expose DataCenterSite;
  }
}
