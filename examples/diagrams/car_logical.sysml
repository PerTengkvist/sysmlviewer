package CarLogical {
  // Simple logical resource model of a car.
  // Metadata keywords classify soft "depends on" relations (shown as «Keyword»).

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

    // Soft resource dependencies classified by metadata keyword
    #Mount dependency from engine to chassis;
    #Mount dependency from transmission to chassis;
    #Driveline dependency from transmission to engine;
    #Mount dependency from steeringWheel to chassis;
    #Drive dependency from frontAxle to transmission;
    #Mount dependency from frontAxle to chassis;
    #Mount dependency from rearAxle to chassis;
    #Mount dependency from brakes to chassis;
    #Actuation dependency from brakes to frontAxle, rearAxle;
  }

  view def CarLogicalView : GeneralView {
    expose Car;
  }
}
