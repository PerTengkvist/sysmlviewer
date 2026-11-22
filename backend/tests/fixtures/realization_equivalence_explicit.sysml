// Explicit function and function node refinements. Same system as realization_equivalence_step.sysml.
package Eq {
  part def Phys { part ecu1; part ecu2; }
  part def Log { part vc; part bc; }
  package UC {
    use case def <'UC1'> Start {
      action check;
      action show;
      first start; then check; then show; then done;
    }
    use case def <'UC2'> Move { action go; action halt; }
    use case def <'UC3'> Park { include use case Start; }
  }
  package F {
    part def Security {
      part auth { perform startFlow.checkKeyInCabin; }
      part immo { perform startFlow.release; }
      action startFlow {
        action checkKeyInCabin;
        action release;
        first start; then checkKeyInCabin; then release; then done;
      }
    }
    part def Drive {
      part motor { perform driveFlow.accelerate; perform driveFlow.brake; }
      action driveFlow { action accelerate; action brake; }
    }
  }
  allocate F::Security::auth to Log::vc;
  allocate F::Security::immo to Log::vc;
  allocate F::Drive::motor to Log::bc;
  #implements dependency from Phys::ecu1 to Log::vc;
  #implements dependency from Phys::ecu2 to Log::bc;
  #refine dependency from F::Security::auth to UC::Start;
  #refine dependency from F::Security::immo to UC::Start;
  #refine dependency from F::Security to UC::Start;
  #refine dependency from F::Drive::motor to UC::Move;
  #refine dependency from F::Drive to UC::Move;
}
