private import PhysicalPorts::*;

package ServerBladePkg {
  // Compute server blade and its hardware parts

  part def Cpu {
    port fabric : CpuFabricPort;
    port power : PowerPort;
    attribute cores : Integer = 32;
  }

  part def Ram {
    port bus : MemoryBusPort;
    port power : PowerPort;
    attribute capacityGB : Integer = 256;
  }

  part def Ssd {
    port bus : StorageBusPort;
    port power : PowerPort;
    attribute capacityTB : Integer = 4;
  }

  part def Nic {
    port host : CpuFabricPort;  // PCIe / host fabric toward CPU
    port eth : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
    attribute speedGbps : Integer = 100;
  }

  part def ServerBlade {
    part cpu : Cpu;
    part ram : Ram;
    part ssd : Ssd;
    part nic : Nic;

    port eth : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
    port cool : CoolingPort;

    connection cpuFabric connect cpu.fabric to ram.bus;
    connection ssdBus connect ssd.bus to cpu.fabric;
    connection nicHost connect cpu.fabric to nic.host;
    connection nicOut connect nic.eth to eth;
    connection nicMgmt connect nic.mgmt to mgmt;
    connection pwrCpu connect power to cpu.power;
    connection pwrRam connect power to ram.power;
    connection pwrSsd connect power to ssd.power;
    connection pwrNic connect power to nic.power;
  }

  view def ServerBladeView : GeneralView {
    expose ServerBlade;
  }

  attribute def Integer;
}
