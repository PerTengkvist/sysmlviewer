package LogicalArchitecture {
  doc /* Logical architecture of the electric car. Car is the assembly. Parts are logical, not yet software, electronics or metal. Dependencies show what is mounted on what, what commands what, and what supplies energy. Interfaces name the contracts. Each contract has a provider port (Out) and a consumer port (In), joined by a connection. Ports are delegated through assembly boundaries so the same interface can be wired at every level. The physical architecture realizes these parts with «implements». */

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
    doc /* Logical electric car: driver controls, motion actuation, skateboard platform, body and cabin comfort. */

    part driverControls {
      doc /* Driver input controls for direction, propulsion mode, torque and braking. */
      port directionOut : DirectionCommand;
      port gearOut : GearCommand;
      port torqueOut : TorqueRequest;
      port brakeOut : BrakeRequest;

      part steeringWheel {
        doc /* Driver control for direction. Provides DirectionCommand. */
        port directionOut : DirectionCommand;
      }

      part gearStick {
        doc /* Driver control for park, reverse, neutral and drive. Provides GearCommand. */
        port gearOut : GearCommand;
      }

      part acceleratorPedal {
        doc /* Driver control for requested traction torque. Provides TorqueRequest. */
        port torqueOut : TorqueRequest;
      }

      part brakePedal {
        doc /* Driver control for deceleration. Provides BrakeRequest. */
        port brakeOut : BrakeRequest;
      }

      connection directionDelegate connect steeringWheel.directionOut to directionOut;
      connection gearDelegate connect gearStick.gearOut to gearOut;
      connection torqueDelegate connect acceleratorPedal.torqueOut to torqueOut;
      connection brakeDelegate connect brakePedal.brakeOut to brakeOut;
    }

    part motionActuation {
      doc /* Actuators that convert driver commands into wheel and powertrain control. */
      port directionIn : DirectionCommand;
      port directionOut : DirectionCommand;
      port gearIn : GearCommand;
      port gearOut : GearCommand;
      port torqueIn : TorqueRequest;
      port torqueOut : TorqueRequest;
      port brakeIn : BrakeRequest;
      port brakeOut : BrakeRequest;

      part steeringServo {
        doc /* Steering actuator. Consumes DirectionCommand from the driver and provides it to the wheels. */
        port directionIn : DirectionCommand;
        port directionOut : DirectionCommand;
      }

      part powertrainControl {
        doc /* Powertrain actuator. Consumes GearCommand and TorqueRequest and provides them to the motor. */
        port gearIn : GearCommand;
        port gearOut : GearCommand;
        port torqueIn : TorqueRequest;
        port torqueOut : TorqueRequest;
      }

      part brakeSystem {
        doc /* Brake actuator. Consumes BrakeRequest from the driver and provides it to the wheels. */
        port brakeIn : BrakeRequest;
        port brakeOut : BrakeRequest;
      }

      connection directionInDelegate connect directionIn to steeringServo.directionIn;
      connection directionOutDelegate connect steeringServo.directionOut to directionOut;
      connection gearInDelegate connect gearIn to powertrainControl.gearIn;
      connection gearOutDelegate connect powertrainControl.gearOut to gearOut;
      connection torqueInDelegate connect torqueIn to powertrainControl.torqueIn;
      connection torqueOutDelegate connect powertrainControl.torqueOut to torqueOut;
      connection brakeInDelegate connect brakeIn to brakeSystem.brakeIn;
      connection brakeOutDelegate connect brakeSystem.brakeOut to brakeOut;
    }

    part skateboard {
      doc /* EV platform: battery, charge inlet, traction motor, chassis, suspension and wheels. */
      port directionIn : DirectionCommand;
      port gearIn : GearCommand;
      port torqueIn : TorqueRequest;
      port brakeIn : BrakeRequest;
      port energyOut : EnergySupply;

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

      part engine {
        attribute powerKW = 150;
        doc /* Electric traction motor, nominally 150 kW. Consumes GearCommand, TorqueRequest and EnergySupply. */
        port gearIn : GearCommand;
        port torqueIn : TorqueRequest;
        port energyIn : EnergySupply;
      }

      part chassis {
        doc /* Structural backbone. The motor, battery, suspension and body are mounted on it. */
      }

      part suspension {
        doc /* Links the wheels to the chassis and keeps the tyres on the road. */
      }

      part wheels {
        doc /* Road wheels that accelerate, brake and steer the car. Consume DirectionCommand and BrakeRequest. */
        port directionIn : DirectionCommand;
        port brakeIn : BrakeRequest;
      }

      #Energy dependency from engine to battery;
      #Energy dependency from chargeInlet to battery;
      #Mount dependency from engine to chassis;
      #Mount dependency from battery to chassis;
      #Mount dependency from suspension to chassis;
      #Support dependency from wheels to suspension;

      connection directionDelegate connect directionIn to wheels.directionIn;
      connection gearDelegate connect gearIn to engine.gearIn;
      connection torqueDelegate connect torqueIn to engine.torqueIn;
      connection brakeDelegate connect brakeIn to wheels.brakeIn;
      connection energyEngine connect battery.energyOut to engine.energyIn;
      connection energyOutDelegate connect battery.energyOut to energyOut;
      connection charge connect chargeInlet.chargeOut to battery.chargeIn;
    }

    part body {
      doc /* Body assembly: shell, door, glazing, wipers and lamps. */
      port energyIn : EnergySupply;

      part bodyShell {
        doc /* Body shell (kaross). Sets length, width, height, seating and cargo volume, and forms the occupant cell. */
      }

      part door {
        doc /* Door with locks. Enforce access control, the immobilizer interlock and lock confirmation. */
      }

      part windshield {
        doc /* Front glass. Consumes WindshieldClear from the wipers. */
        port clearIn : WindshieldClear;
      }

      part window {
        doc /* Side and rear glazing in the body shell. */
      }

      part wipers {
        doc /* Wiper and washer mechanism on the body. Provides WindshieldClear to the windshield. */
        port clearOut : WindshieldClear;
      }

      part lamps {
        doc /* Headlamps, tail lamps and direction indicators. Consume EnergySupply from the battery. */
        port energyIn : EnergySupply;
      }

      #Mount dependency from window to bodyShell;
      #Mount dependency from windshield to bodyShell;
      #Mount dependency from wipers to bodyShell;
      #Mount dependency from door to bodyShell;
      #Mount dependency from lamps to bodyShell;
      #Clear dependency from wipers to windshield;

      connection energyDelegate connect energyIn to lamps.energyIn;
      connection clear connect wipers.clearOut to windshield.clearIn;
    }

    part cabinComfort {
      doc /* Cabin climate and entertainment systems. */
      port energyIn : EnergySupply;

      part climateSystem {
        doc /* Logical heating, ventilation and cooling of the cabin. Consumes EnergySupply from the battery. */
        port energyIn : EnergySupply;
      }

      part entertainmentSystem {
        doc /* Logical cabin audio and video. Consumes EnergySupply from the battery. */
        port energyIn : EnergySupply;
      }

      connection energyClimate connect energyIn to climateSystem.energyIn;
      connection energyEntertainment connect energyIn to entertainmentSystem.energyIn;
    }

    #Command dependency from driverControls to motionActuation;
    #Command dependency from motionActuation to skateboard;
    #Energy dependency from cabinComfort to skateboard;
    #Energy dependency from body to skateboard;
    #Mount dependency from body to skateboard;

    connection directionCommand connect driverControls.directionOut to motionActuation.directionIn;
    connection gearCommand connect driverControls.gearOut to motionActuation.gearIn;
    connection torqueCommand connect driverControls.torqueOut to motionActuation.torqueIn;
    connection brakeCommand connect driverControls.brakeOut to motionActuation.brakeIn;
    connection directionActuate connect motionActuation.directionOut to skateboard.directionIn;
    connection gearActuate connect motionActuation.gearOut to skateboard.gearIn;
    connection torqueActuate connect motionActuation.torqueOut to skateboard.torqueIn;
    connection brakeActuate connect motionActuation.brakeOut to skateboard.brakeIn;
    connection energyCabin connect skateboard.energyOut to cabinComfort.energyIn;
    connection energyBody connect skateboard.energyOut to body.energyIn;
  }

  view def CarLogicalView : GeneralView {
    doc /* Logical whitebox of Car. Nested assemblies, provider and consumer ports, the connections between them, and «Command», «Energy», «Mount», «Support» and «Clear» dependencies. */
    expose Car;
  }

  view def CarLogicalTree : TreeView {
    doc /* Containment tree of the logical car. */
    expose Car;
  }

  view def DriverControlsView : GeneralView {
    doc /* Whitebox of driverControls: steering, gear, accelerator and brake inputs with delegated command ports. */
    expose Car::driverControls;
  }

  view def MotionActuationView : GeneralView {
    doc /* Whitebox of motionActuation: steering servo, powertrain control and brake system. */
    expose Car::motionActuation;
  }

  view def SkateboardView : GeneralView {
    doc /* Whitebox of the skateboard platform: battery, charge inlet, engine, chassis, suspension and wheels. */
    expose Car::skateboard;
  }

  view def BodyView : GeneralView {
    doc /* Whitebox of the body assembly: shell, door, glazing, wipers and lamps. */
    expose Car::body;
  }

  view def CabinComfortView : GeneralView {
    doc /* Whitebox of cabinComfort: climate and entertainment systems. */
    expose Car::cabinComfort;
  }
}
