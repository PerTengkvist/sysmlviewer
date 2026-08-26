private import PhysicalPorts::*;

package SwitchPkg {
  // Top-of-rack Ethernet switch

  part def Switch {
    port downlink : EthernetPort;
    port uplink : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
    port cool : CoolingPort;
  }

  view def SwitchView : GeneralView {
    expose Switch;
  }
}
