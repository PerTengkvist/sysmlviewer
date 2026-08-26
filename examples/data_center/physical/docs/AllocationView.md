# AllocationView

**AllocationView** exposing `DataCenterSite`.

## Purpose

Dedicated diagram for **logical-to-physical allocation**: which logical services and ports map onto which hardware endpoints.

## What you see

- **Left column (logical):** parts under embedded `DataCenter`—cluster planes, orchestrator, monitoring, IaaC
- **Right column (physical):** `bladeCompute`, `bladeControl`, `nas`, `torSwitch`, `edgeRouter`
- **Purple allocation edges:** connections named `alloc*` linking logical ports to physical ports

## Not shown

Facility power, cooling fabric, and east-west physical Ethernet (blade↔switch) are hidden here to reduce noise—see `DataCenterPhysicalView` for full hardware wiring.

## Coverage

Maps all major logical parts from `DataCenterLogical` to physical hosts: compute→compute blade, storage→NAS, network→switch, orchestrator/IaaC/monitoring→control blade and edge router as documented in `data_center_physical.sysml`.
