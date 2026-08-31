private import PhysicalPorts::*;

package NetworkStoragePkg {
  // Network-attached storage appliance

  part def StorageCpu {
    port fabric : CpuFabricPort;
    port power : PowerPort;
  }

  part def StorageRam {
    port bus : MemoryBusPort;
    port power : PowerPort;
    attribute capacityGB : Integer = 128;
  }

  part def StorageDrive {
    port bus : StorageBusPort;
    port power : PowerPort;
    attribute capacityTB : Integer = 16;
  }

  part def StorageNic {
    port host : CpuFabricPort;
    port eth : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
  }

  part def NetworkStorage {
    part cpu : StorageCpu;
    part ram : StorageRam;
    // Drive array (multiple SSD units as nested parts)
    part ssd0 : StorageDrive;
    part ssd1 : StorageDrive;
    part ssd2 : StorageDrive;
    part ssd3 : StorageDrive;
    part nic : StorageNic;

    port eth : EthernetPort;
    port mgmt : ManagementPort;
    port power : PowerPort;
    port cool : CoolingPort;

    connection mem connect cpu.fabric to ram.bus;
    connection d0 connect ssd0.bus to cpu.fabric;
    connection d1 connect ssd1.bus to cpu.fabric;
    connection d2 connect ssd2.bus to cpu.fabric;
    connection d3 connect ssd3.bus to cpu.fabric;
    connection nicHost connect cpu.fabric to nic.host;
    connection net connect nic.eth to eth;
    connection nicMgmt connect nic.mgmt to mgmt;
    connection pwrCpu connect power to cpu.power;
    connection pwrRam connect power to ram.power;
    connection pwrNic connect power to nic.power;
  }

  view def NetworkStorageView : GeneralView {
    expose NetworkStorage;
  }

  attribute def Integer;
}
