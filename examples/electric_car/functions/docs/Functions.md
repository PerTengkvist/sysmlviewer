# Functions

Functional architecture of the electric car. Each top-level part is a function the car performs for its users; the parts nested inside it are the functional entities the function decomposes into. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Each function also «refine»s the use cases it carries out; those dependencies are collected in the FunctionTraceability package. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. Every functional entity is allocated to exactly one logical part, and a logical part comprises one or more entities. That allocation is how the logical architecture is synthesized from the use cases. Each function also has an action flow, and every step of it is performed by one of its functional entities; a FlowView per function shows the flow with the performer on each step.

## Diagrams

- `FunctionsView`
- `FunctionAllocationView`
