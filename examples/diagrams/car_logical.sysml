package CarLogical {
  // Simple logical resource model of a car.
  // Dependencies express soft "depends on" between parts (no port wiring).

  attribute def Real;
  attribute def Integer;
  attribute def String;
  attribute def Boolean;

  part def Chassis {
    attribute role : String = "structure";
  }

  part def Engine {
    attribute powerKW : Real = 110.0;
  }

  part def Transmission {
    attribute gears : Integer = 6;
  }

  part def SteeringWheel {
    attribute diameterMM : Real = 370.0;
  }

  part def Axle {
    attribute driven : Boolean = true;
  }

  part def BrakeSystem {
    attribute type : String = "disc";
  }

  part def Car {
    part chassis : Chassis;
    part engine : Engine;
    part transmission : Transmission;
    part steeringWheel : SteeringWheel;
    part frontAxle : Axle;
    part rearAxle : Axle;
    part brakes : BrakeSystem;

    // Soft resource dependencies (logical "depends on")
    dependency engineMount from engine to chassis;
    dependency gearboxMount from transmission to chassis;
    dependency driveline from transmission to engine;
    dependency steerMount from steeringWheel to chassis;
    dependency frontDrive from frontAxle to transmission;
    dependency frontSupport from frontAxle to chassis;
    dependency rearSupport from rearAxle to chassis;
    dependency brakeMount from brakes to chassis;
    dependency brakeActuation from brakes to frontAxle, rearAxle;
  }

  view def CarLogicalView : GeneralView {
    expose Car;
  }
}
