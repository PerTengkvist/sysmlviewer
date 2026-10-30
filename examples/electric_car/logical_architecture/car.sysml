package LogicalArchitecture {
  doc /* Logical architecture of the electric car. Car is the assembly. Parts are logical, not yet software, electronics or metal. Three controllers decide: vehicleController owns power modes and authentication, driveController owns torque, braking, gear and steering, bodyController owns locks, doors, windows, lamps and wipers. Driver controls talk to a controller, controllers talk to actuators, and the instrument cluster tells the driver what happened. Dependencies show what commands what, what supplies energy and what is mounted on what. Interfaces name the contracts: a provider port (Out) and a consumer port (In), joined by a connection. The physical architecture realizes these parts with «implements». */

  interface def DirectionCommand {
    doc /* Steering command. The steering wheel provides the driver's angle to the drive controller, which provides the wheel angle to the road wheels. */
  }
  interface def GearCommand {
    doc /* Park, reverse, neutral or drive. The gear stick provides it to the drive controller, which provides the motor mode to the engine. */
  }
  interface def TorqueRequest {
    doc /* Requested traction torque from pedal travel. The accelerator provides it and the drive controller consumes it. */
  }
  interface def TorqueCommand {
    doc /* Arbitrated traction torque, positive for drive and negative for regeneration. The drive controller provides it and the engine consumes it. */
  }
  interface def BrakeRequest {
    doc /* Requested deceleration from pedal force. The brake pedal provides it and the drive controller consumes it. */
  }
  interface def BrakeCommand {
    doc /* Friction brake pressure after regen blending. The drive controller provides it and the friction brakes consume it. */
  }
  interface def StartRequest {
    doc /* Start or stop the vehicle. The start button provides it and the vehicle controller consumes it. */
  }
  interface def Credential {
    doc /* Driver credential. The key fob provides it and the vehicle controller consumes it. */
  }
  interface def DriveEnable {
    doc /* Immobilizer release and high-voltage ready. The vehicle controller provides it and the drive controller consumes it. */
  }
  interface def LockCommand {
    doc /* Engage or release the door latches. The body controller provides it and the locks consume it. */
  }
  interface def DoorCommand {
    doc /* Open or close a door. The body controller provides it and the doors consume it. */
  }
  interface def WindowCommand {
    doc /* Raise or lower a window. The body controller provides it and the window lifts consume it. */
  }
  interface def LampCommand {
    doc /* Headlamps, brake lamps, indicators and hazard lights. The body controller provides it and the lamps consume it. */
  }
  interface def WipeCommand {
    doc /* Wipe and wash. The body controller provides it and the wipers consume it. */
  }
  interface def DriverFeedback {
    doc /* Everything the driver is told: ready, gear, speed, state of charge, warnings. The vehicle controller provides it and the instrument cluster consumes it. */
  }
  interface def EnergySupply {
    doc /* Traction energy. The battery provides it. The motor, climate, entertainment, lamps and window lifts consume it. */
  }
  interface def ChargeFeed {
    doc /* Energy from an external charger. The charge inlet provides it and the battery consumes it. */
  }
  interface def WindshieldClear {
    doc /* Wiping action. The wipers provide it and the windshield consumes it. */
  }

  part def Car {
    doc /* Logical electric car: driver controls, three controllers, traction, energy, body and cabin systems. */

    part keyFob {
      doc /* Remote key the driver carries. Provides Credential to the vehicle controller for unlock, lock and start. */
      port credentialOut : Credential;
    }

    part startButton {
      doc /* Driver control that starts and stops the vehicle. Provides StartRequest to the vehicle controller. */
      port startOut : StartRequest;
    }

    part steeringWheel {
      doc /* Driver control for direction. Provides DirectionCommand to the drive controller. */
      port directionOut : DirectionCommand;
    }

    part gearStick {
      doc /* Driver control for park, reverse, neutral and drive. Provides GearCommand to the drive controller. */
      port gearOut : GearCommand;
    }

    part acceleratorPedal {
      doc /* Driver control for requested traction torque. Provides TorqueRequest to the drive controller. */
      port torqueOut : TorqueRequest;
    }

    part brakePedal {
      doc /* Driver control for deceleration. Provides BrakeRequest to the drive controller. */
      port brakeOut : BrakeRequest;
    }

    part vehicleController {
      doc /* Decides whether the car is Locked, Unlocked, Ready, Driving, Parked or Charging. Authenticates the key fob, releases the immobilizer, enables the drive controller and tells the driver through the instrument cluster. */
      port credentialIn : Credential;
      port startIn : StartRequest;
      port driveEnableOut : DriveEnable;
      port feedbackOut : DriverFeedback;
    }

    part driveController {
      doc /* Turns pedal, gear and steering inputs into torque, brake pressure, motor mode and wheel angle. Blends regenerative and friction braking. Only acts when the vehicle controller has enabled driving. */
      port driveEnableIn : DriveEnable;
      port torqueIn : TorqueRequest;
      port brakeIn : BrakeRequest;
      port gearIn : GearCommand;
      port directionIn : DirectionCommand;
      port torqueCommandOut : TorqueCommand;
      port brakeCommandOut : BrakeCommand;
      port gearCommandOut : GearCommand;
      port directionCommandOut : DirectionCommand;
    }

    part bodyController {
      doc /* Commands the body actuators: locks, doors, window lifts, lamps and wipers. Flashes the indicators to confirm lock and unlock. */
      port lockOut : LockCommand;
      port doorOut : DoorCommand;
      port windowOut : WindowCommand;
      port lampOut : LampCommand;
      port wipeOut : WipeCommand;
    }

    part instrumentCluster {
      doc /* Display and chimes in front of the driver. Consumes DriverFeedback and shows ready state, gear, speed, state of charge and warnings. */
      port feedbackIn : DriverFeedback;
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
      doc /* Electric traction motor, nominally 150 kW. Consumes GearCommand and TorqueCommand from the drive controller and EnergySupply from the battery. Drives the wheels. */
      port gearCommandIn : GearCommand;
      port torqueCommandIn : TorqueCommand;
      port energyIn : EnergySupply;
    }

    part battery {
      attribute _icon="battery";
      attribute capacityKWh = 60;
      doc /* Traction battery, nominally 60 kWh. Provides EnergySupply and consumes ChargeFeed. Its discharge limit bounds the torque the drive controller may command. */
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
      doc /* Road wheels that accelerate, brake and steer the car. Consume DirectionCommand from the drive controller; the engine and the friction brakes act on them. */
      port directionCommandIn : DirectionCommand;
    }

    part frictionBrakes {
      doc /* Hydraulic friction brakes on every wheel. Consume BrakeCommand from the drive controller and act on the wheels. */
      port brakeCommandIn : BrakeCommand;
    }

    part suspension {
      doc /* Links the wheels to the chassis and keeps the tyres on the road. */
    }

    part body {
      doc /* Body shell (kaross). Sets length, width, height, seating and cargo volume, and forms the occupant cell. */
    }

    part doors {
      doc /* Four doors in the body shell. Consume DoorCommand from the body controller and report open or closed. */
      port doorIn : DoorCommand;
    }

    part windows {
      doc /* Side and rear glazing in the body shell. */
    }

    part windowLifts {
      doc /* Motors that raise and lower the side windows. Consume WindowCommand from the body controller and EnergySupply from the battery. Stop on pinch. */
      port windowIn : WindowCommand;
      port energyIn : EnergySupply;
    }

    part windshield {
      doc /* Front glass. Consumes WindshieldClear from the wipers. */
      port clearIn : WindshieldClear;
    }

    part wipers {
      doc /* Wiper and washer mechanism on the body. Consumes WipeCommand from the body controller and provides WindshieldClear to the windshield. */
      port wipeIn : WipeCommand;
      port clearOut : WindshieldClear;
    }

    part locks {
      doc /* Door latches. Consume LockCommand from the body controller and report latched or released. */
      port lockIn : LockCommand;
    }

    part lamps {
      doc /* Headlamps, tail lamps, brake lamps, direction indicators and hazard lights. Consume LampCommand from the body controller and EnergySupply from the battery. */
      port lampIn : LampCommand;
      port energyIn : EnergySupply;
    }

    #Command dependency from keyFob to vehicleController;
    #Command dependency from startButton to vehicleController;
    #Command dependency from steeringWheel to driveController;
    #Command dependency from gearStick to driveController;
    #Command dependency from acceleratorPedal to driveController;
    #Command dependency from brakePedal to driveController;
    #Enable dependency from vehicleController to driveController;
    #Inform dependency from vehicleController to instrumentCluster;
    #Command dependency from driveController to engine;
    #Command dependency from driveController to wheels;
    #Command dependency from driveController to frictionBrakes;
    #Command dependency from bodyController to locks;
    #Command dependency from bodyController to doors;
    #Command dependency from bodyController to windowLifts;
    #Command dependency from bodyController to lamps;
    #Command dependency from bodyController to wipers;
    #Energy dependency from engine to battery;
    #Energy dependency from climateSystem to battery;
    #Energy dependency from entertainmentSystem to battery;
    #Energy dependency from lamps to battery;
    #Energy dependency from windowLifts to battery;
    #Energy dependency from chargeInlet to battery;
    #Mount dependency from engine to chassis;
    #Mount dependency from battery to chassis;
    #Mount dependency from suspension to chassis;
    #Mount dependency from body to chassis;
    #Support dependency from wheels to suspension;
    #Actuate dependency from engine to wheels;
    #Actuate dependency from frictionBrakes to wheels;
    #Mount dependency from doors to body;
    #Mount dependency from windows to body;
    #Mount dependency from windowLifts to body;
    #Mount dependency from windshield to body;
    #Mount dependency from wipers to body;
    #Mount dependency from locks to body;
    #Mount dependency from lamps to body;
    #Mount dependency from instrumentCluster to body;
    #Mount dependency from startButton to body;
    #Clear dependency from wipers to windshield;

    connection credential connect keyFob.credentialOut to vehicleController.credentialIn;
    connection start connect startButton.startOut to vehicleController.startIn;
    connection driveEnable connect vehicleController.driveEnableOut to driveController.driveEnableIn;
    connection feedback connect vehicleController.feedbackOut to instrumentCluster.feedbackIn;
    connection steerInput connect steeringWheel.directionOut to driveController.directionIn;
    connection direction connect driveController.directionCommandOut to wheels.directionCommandIn;
    connection gearInput connect gearStick.gearOut to driveController.gearIn;
    connection gear connect driveController.gearCommandOut to engine.gearCommandIn;
    connection torqueRequest connect acceleratorPedal.torqueOut to driveController.torqueIn;
    connection torque connect driveController.torqueCommandOut to engine.torqueCommandIn;
    connection brakeRequest connect brakePedal.brakeOut to driveController.brakeIn;
    connection brake connect driveController.brakeCommandOut to frictionBrakes.brakeCommandIn;
    connection lock connect bodyController.lockOut to locks.lockIn;
    connection door connect bodyController.doorOut to doors.doorIn;
    connection window connect bodyController.windowOut to windowLifts.windowIn;
    connection lamp connect bodyController.lampOut to lamps.lampIn;
    connection wipe connect bodyController.wipeOut to wipers.wipeIn;
    connection energyEngine connect battery.energyOut to engine.energyIn;
    connection energyClimate connect battery.energyOut to climateSystem.energyIn;
    connection energyEntertainment connect battery.energyOut to entertainmentSystem.energyIn;
    connection energyLamps connect battery.energyOut to lamps.energyIn;
    connection energyWindows connect battery.energyOut to windowLifts.energyIn;
    connection charge connect chargeInlet.chargeOut to battery.chargeIn;
    connection clear connect wipers.clearOut to windshield.clearIn;
  }

  view def CarLogicalView : GeneralView {
    doc /* Logical whitebox of Car: nested parts, ports and connections between them (dependencies filtered out). */
    expose Car;
    filter @PartUsage or @PortUsage or @ConnectionUsage;
  }

  view def CarLogicalDependenciesView : GeneralView {
    doc /* Logical car parts and their «Command», «Enable», «Inform», «Energy», «Mount», «Support», «Actuate» and «Clear» dependencies (connections filtered out). */
    expose Car;
    filter @PartUsage or @Dependency;
  }

  view def CarLogicalTree : TreeView {
    doc /* Containment tree of the logical car. */
    expose Car;
  }
}
