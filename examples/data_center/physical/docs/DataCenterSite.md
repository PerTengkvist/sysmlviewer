# DataCenterSite

**Physical site assembly** containing blades, NAS, switch, router, cooling, and embedded logical `DataCenter`.

## Structure

- Compute: `bladeCompute`, `bladeControl`
- Storage: `nas`
- Network: `torSwitch`, `edgeRouter`
- Facility: `cooling`, `facilityPower`, `facilityNetwork`
- Logical embed: `logical : DataCenter`

## Diagrams

Use `DataCenterPhysicalView` for power/cooling/Ethernet fabric; use `AllocationView` for logical→physical mapping.
