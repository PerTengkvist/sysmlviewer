package Example {
  // Scalar stand-ins (no SysML standard library in this workspace)
  attribute def Real;
  attribute def Integer;
  attribute def String;

  //define types
  item def Event {
    attribute name : String;
    attribute data : String;
  }
  //define ports
  port def EventClientPort {
    out item sent : Event;     // send_event
    in  item received : Event; // get_event
  }
  port def EventBrokerPort {
    in  item toRoute : Event;  // route_event
    in  item toQueue : Event;  // queue_event
    out item delivered : Event;
  }

  port def PowerPort {
    out attribute power : Real;
  }

  //define parts
  part def Axle {
    port TorqueIn;
    attribute rotationSpeed : Real = 0.0;
  }

  part def Battery {
    port EventOut:EventClientPort;
    port powerOut : PowerPort;
    attribute SoC : Real = 1.0;
    attribute power : Real;
  }

  part def Engine {
    port EventOut:EventClientPort;
    port GaugeIn;
    port PowerIn : PowerPort;
    port TorqueOut;
    attribute rpm : Integer = 0;
    attribute status : String = "idle";
    attribute torque : Real;
  }

  part def Vehicle {
    part axle : Axle;
    part battery : Battery;
    part engine : Engine;
    port EventOut;
    port GaugeIn;
    attribute status : String = "ok";
    connection poower connect battery.powerOut to engine.PowerIn;
    connection torque connect engine.TorqueOut to axle.TorqueIn;
    connection eventbus connect (engine.EventOut, battery.EventOut, EventOut);
    connection gaugebus connect GaugeIn to engine.GaugeIn;
  }

  //define views
  view ExampleView : GeneralView {
    expose Vehicle;
  }
}
