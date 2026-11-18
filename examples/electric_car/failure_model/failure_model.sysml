package FailureModel {
  doc /* Small reusable library for failure-impact analysis. A failure mode is a FailureKind. The metadata keywords tell the analysis how instances of a part combine: Single (all needed, the default), Pool (instance capacities add up, with a minimum required), Redundant (k of n, k given by the required attribute) and Soft (on a dependency: degrades the dependent function instead of losing it). */

  enum def FailureKind { loss; degraded; erroneous; }
  metadata def Single;             // default when nothing is said
  metadata def Pool;               // instances add up capacity
  metadata def Redundant;          // k-of-n, k given by attribute 'required'
  metadata def Soft;               // on a dependency: degrades instead of loses
}
