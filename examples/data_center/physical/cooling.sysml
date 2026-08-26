private import PhysicalPorts::*;

package CoolingPkg {
  // Facility cooling loop serving racks and network gear

  part def Cooling {
    port coolLoop : CoolingPort;
    port power : PowerPort;
  }

  view def CoolingView : GeneralView {
    expose Cooling;
  }
}
