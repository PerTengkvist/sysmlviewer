# LogicalCounterparts

Logical architecture counterparts referenced by «implements» from VehiclePhysical. Kept outside the physical whitebox so PhysicalView stays mechanical/software only. Each counterpart subsets its part in LogicalArchitecture::Car, and car refers to the logical Car itself, so an «implements» leads on to the logical part, its allocated functions and their use cases.

## Diagrams

- `PhysicalDependenciesView`
