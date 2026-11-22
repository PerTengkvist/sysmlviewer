// Use case realization: how functions, function nodes and logical parts realize
// use cases. The one link written by hand is a `#refine` from a function step to a
// use case step; the rest (function, function node, logical part) is derived from it.
// Start is realized step by step (askForBrake is deliberately left unrealized),
// Unlock and Lock by coarser links, and Drive through its `include`s.
package UseCaseRealization {
  package UC {
    use case def <'UCA'> Start {
      actor Driver { perform pressStart; }
      action pressStart;
      action checkKey;
      action showReady;
      action askForBrake;
      first start; then pressStart; then checkKey; then showReady; then done;
    }
    use case def <'UCB'> Unlock {
      actor Driver { perform pressUnlock; }
      action pressUnlock;
      action unlockDoors;
    }
    use case def <'UCC'> Lock { action lockDoors; }
    use case def <'UCD'> Drive {
      include use case Start;
      include use case Unlock;
    }
  }
  package F {
    part def Security {
      part auth  { perform startFlow.checkKeyInCabin; }
      part immo  { perform startFlow.releaseImmobilizer; perform startFlow.logStart; }
      part locks { perform unlockFlow.release; }
      action startFlow {
        action checkKeyInCabin;
        action releaseImmobilizer;
        action logStart;
        first start; then checkKeyInCabin; then releaseImmobilizer; then logStart; then done;
      }
      action unlockFlow { action release; }
    }
  }
  package L { part vc; part bc; }
  allocate F::Security::auth to L::vc;
  allocate F::Security::immo to L::vc;
  allocate F::Security::locks to L::bc;
  #refine dependency from F::Security::startFlow::checkKeyInCabin to UC::Start::checkKey;
  #refine dependency from F::Security::startFlow::releaseImmobilizer to UC::Start::showReady;
  #refine dependency from F::Security::unlockFlow to UC::Unlock;
  #refine dependency from F::Security to UC::Lock;

  view UseCaseRealizationView : UseCaseView {
    expose UseCaseRealization::UC;
  }
}
