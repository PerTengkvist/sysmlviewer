# LogicalPorts

Package that defines **logical interface types** (port definitions) for the data-center model.

## Purpose

Central catalog of S/U entity interface naming (`*_s?i`, `*_s?p`, `*_r?p`) used across orchestrator, cluster, compute, storage, network, IaaC, and monitoring parts.

## Contents

Port definitions grouped by logical service domain: orchestrator, cluster, compute, storage, network, iaac, monitoring, plus `LogPort` for optional log intake.

## Related views

Used as type references from all logical part definitions in `logical/`.
