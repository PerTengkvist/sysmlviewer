package UseCasesExample {
  // Classic use-case model: actors, include, extend and objective.

  part def Vehicle;
  actor def Operator;
  actor def Driver;

  requirement def <'R-UC-01'> AuthenticatedAccess {
    doc /* Access requires successful authentication */
  }

  use case def Authenticate {
    doc /* Verify operator credentials */
  }

  use case def Login {
    actor operator : Operator;
    include use case Authenticate;
    objective AuthenticatedAccess;
  }

  use case def Drive {
    actor driver : Driver;
    subject vehicle : Vehicle;
  }

  use case def EmergencyStop {
    actor driver : Driver;
  }

  #extend dependency EmergencyStop to Drive;
  #use dependency Drive to Login;

  view def VehicleUseCaseView : UseCaseView {
    expose UseCasesExample;
  }

  view def UseCasesStructureView : GeneralView {
    expose UseCasesExample;
  }
}
