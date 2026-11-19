package SequenceProbe {
  occurrence def Probe {
    ref part car : LogicalArchitecture::Car;
    ref part keyFob :> car.keyFob;
    ref part frictionBrakes :> LogicalArchitecture::Car::frictionBrakes;
    part electricMotor;
    part modules : PhysicalArchitecture::BatteryModule;
    ref part brakes : PhysicalArchitecture::BrakeCircuit;
    message m1 from keyFob to modules;
    message m2 from electricMotor to brakes;
    message m3 from car.battery to frictionBrakes;
  }
}
