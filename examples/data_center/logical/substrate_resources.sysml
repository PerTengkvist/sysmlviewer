private import LogicalPorts::*;

package SubstrateResourcesPkg {
  // Layer 3 substrate — vendor-neutral logical capacity (cores, GB, Gbps).
  // Layer 4 (physical/) maps these to manufacturer-specific parts (Cpu, Ram, …).

  part def LogicalCpu {
    attribute cores : Integer = 32;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalRam {
    attribute capacityGB : Integer = 256;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalStorageVolume {
    attribute capacityTB : Integer = 4;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalNetworkSegment {
    attribute bandwidthGbps : Integer = 100;
    port smp : iaac_smi;
    port scp : iaac_sci;
    port sdp : k8n_vlan;
  }

  part def LogicalCpuPool {
    part cpu [0..*] : LogicalCpu;
    attribute totalCores : Integer = 128;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalMemoryPool {
    part bank [0..*] : LogicalRam;
    attribute totalGB : Integer = 1024;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalStoragePool {
    part volume [0..*] : LogicalStorageVolume;
    attribute totalTB : Integer = 64;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def LogicalNetworkPool {
    part segment [0..*] : LogicalNetworkSegment;
    attribute totalGbps : Integer = 400;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  part def ResourcePool {
    part cpus : LogicalCpuPool;
    part memory : LogicalMemoryPool;
    part storage : LogicalStoragePool;
    part network : LogicalNetworkPool;
    port smp : iaac_smi;
    port scp : iaac_sci;
  }

  attribute def Integer;
}
