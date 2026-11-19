# SysML v2 libraries

Reusable SysML v2 packages for SysML Viewer's toolbox. A project only sees `.sysml` files below its
own folder, so **copy** a library file into your project (any subfolder) and import its package.
SysML imports name the package, not the file path.

| File | Package | Used by | Import |
|---|---|---|---|
| `failure_model.sysml` | `FailureModel` | `scripts/failure_impact.py`, `scripts/fmea.py` | `private import FailureModel::*;` |

## FailureModel

- **Metadata keywords**:
  - `#Pool` adds up the capacities of the instances, with a minimum `required`.
  - `#Redundant` means k of n, with k given by `required`.
  - `#Single` means every instance is needed. It is the default.
  - `#Soft` goes after the keyword of a dependency. It degrades the dependent function instead of losing it.
- **Failure kinds**: the enum `FailureKind` has the values loss, degraded and erroneous.

The Electric Car example keeps a copy in `examples/electric_car/failure_model/failure_model.sysml`.
A test keeps that copy identical to this file, so update both together. See `docs/architecture.md`
(Failure impact) and the tutorial *FMEA and FMECA* for how the keywords are used.
