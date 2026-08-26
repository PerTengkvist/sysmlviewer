private import PhysicalPorts::*;

package RouterPkg {
  // Edge router connecting site LAN to WAN

  part def Router {
    port lan : EthernetPort;
    port wan : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
    port cool : CoolingPort;
  }

  view def RouterView : GeneralView {
    expose Router;
  }
}
