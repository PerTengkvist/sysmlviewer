package LogicalArchitecture {
  doc /* Logical architecture of the electric car. Car is the assembly. Parts are logical, not yet software, electronics or metal. Dependencies show what is mounted on what, what commands what, and what supplies energy. Interfaces name the contracts. Each contract has a provider port (Out) and a consumer port (In), joined by a connection. The physical architecture realizes these parts with «implements». */

  interface def DirectionCommand {
    doc /* Steering command. The steering control provides it and the road wheels consume it. */
  }
  interface def GearCommand {
    doc /* Park, reverse, neutral or drive. The gear selector provides it and the traction motor consumes it. */
  }
  interface def TorqueRequest {
    doc /* Requested traction torque. The accelerator provides it and the traction motor consumes it. */
  }
  interface def BrakeRequest {
    doc /* Requested deceleration. The brake pedal provides it and the road wheels consume it. */
  }
  interface def EnergySupply {
    doc /* Traction energy. The battery provides it. The motor, climate, entertainment and lamps consume it. */
  }
  interface def ChargeFeed {
    doc /* Energy from an external charger. The charge inlet provides it and the battery consumes it. */
  }
  interface def WindshieldClear {
    doc /* Wiping action. The wipers provide it and the windshield consumes it. */
  }

  part def Car {
    doc /* Logical electric car: driver controls, traction, energy, body and cabin systems. */

    part steeringWheel {
      doc /* Driver control for direction. Provides DirectionCommand to the road wheels. */
      port directionOut : DirectionCommand;
    }

    part gearStick {
      doc /* Driver control for park, reverse, neutral and drive. Provides GearCommand to the motor. */
      port gearOut : GearCommand;
    }

    part acceleratorPedal {
      doc /* Driver control for requested traction torque. Provides TorqueRequest to the motor. */
      port torqueOut : TorqueRequest;
    }

    part brakePedal {
      doc /* Driver control for deceleration. Provides BrakeRequest to the wheels. */
      port brakeOut : BrakeRequest;
    }

    part climateSystem {
      doc /* Logical heating, ventilation and cooling of the cabin. Consumes EnergySupply from the battery. */
      port energyIn : EnergySupply;
    }

    part entertainmentSystem {
      doc /* Logical cabin audio and video. Consumes EnergySupply from the battery. */
      port energyIn : EnergySupply;
    }

    part engine {
      attribute powerKW = 150;
      doc /* Electric traction motor, nominally 150 kW. Consumes GearCommand, TorqueRequest and EnergySupply. */
      port gearIn : GearCommand;
      port torqueIn : TorqueRequest;
      port energyIn : EnergySupply;
    }

    part battery {
      attribute capacityKWh = 60;
      doc /* Traction battery, nominally 60 kWh. Provides EnergySupply and consumes ChargeFeed. */
      port energyOut : EnergySupply;
      port chargeIn : ChargeFeed;
    }

    part chargeInlet {
      doc /* Inlet where a home or DC charger connects. Provides ChargeFeed to the battery. */
      port chargeOut : ChargeFeed;
    }

    part chassis {
      doc /* Structural backbone. The motor, battery, suspension and body are mounted on it. */
    }

    part wheels {
      doc /* Road wheels that accelerate, brake and steer the car. Consume DirectionCommand and BrakeRequest. */
      port directionIn : DirectionCommand;
      port brakeIn : BrakeRequest;
    }

    part suspension {
      doc /* Links the wheels to the chassis and keeps the tyres on the road. */
    }

    part windows {
      doc /* Side and rear glazing in the body shell. */
    }

    part body {
      doc /* Body shell (kaross). Sets length, width, height, seating and cargo volume, and forms the occupant cell. */
    }

    part windshield {
      doc /* Front glass. Consumes WindshieldClear from the wipers. */
      port clearIn : WindshieldClear;
    }

    part wipers {
      doc /* Wiper and washer mechanism on the body. Provides WindshieldClear to the windshield. */
      port clearOut : WindshieldClear;
    }

    part locks {
      doc /* Door locks. Enforce access control, the immobilizer interlock and lock confirmation. */
    }

    part lamps {
      doc /* Headlamps, tail lamps and direction indicators. Consume EnergySupply from the battery. */
      port energyIn : EnergySupply;
    }

    #Command dependency from steeringWheel to wheels;
    #Command dependency from gearStick to engine;
    #Command dependency from acceleratorPedal to engine;
    #Command dependency from brakePedal to wheels;
    #Energy dependency from engine to battery;
    #Energy dependency from climateSystem to battery;
    #Energy dependency from entertainmentSystem to battery;
    #Energy dependency from lamps to battery;
    #Energy dependency from chargeInlet to battery;
    #Mount dependency from engine to chassis;
    #Mount dependency from battery to chassis;
    #Mount dependency from suspension to chassis;
    #Mount dependency from body to chassis;
    #Support dependency from wheels to suspension;
    #Mount dependency from windows to body;
    #Mount dependency from windshield to body;
    #Mount dependency from wipers to body;
    #Mount dependency from locks to body;
    #Mount dependency from lamps to body;
    #Clear dependency from wipers to windshield;

    connection direction connect steeringWheel.directionOut to wheels.directionIn;
    connection gear connect gearStick.gearOut to engine.gearIn;
    connection torque connect acceleratorPedal.torqueOut to engine.torqueIn;
    connection brake connect brakePedal.brakeOut to wheels.brakeIn;
    connection energyEngine connect battery.energyOut to engine.energyIn;
    connection energyClimate connect battery.energyOut to climateSystem.energyIn;
    connection energyEntertainment connect battery.energyOut to entertainmentSystem.energyIn;
    connection energyLamps connect battery.energyOut to lamps.energyIn;
    connection charge connect chargeInlet.chargeOut to battery.chargeIn;
    connection clear connect wipers.clearOut to windshield.clearIn;
  }

  view def CarLogicalView : GeneralView {
    doc /* Logical whitebox of Car. Nested parts, provider and consumer ports, the connections between them, and «Command», «Energy», «Mount», «Support» and «Clear» dependencies. */
    expose Car;
  }

  view def CarLogicalTree : TreeView {
    doc /* Containment tree of the logical car. */
    expose Car;
  }
}
