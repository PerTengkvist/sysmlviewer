package PhysicalArchitecture {
  doc /* Physical architecture of the electric car. Software components run on embedded controllers. The three logical controllers each get their own computer: vehicleEcu, driveEcu and bodyEcu. Climate and entertainment share the infotainment computer. The engine and the battery each have their own. Everything else is mechanical. Every physical part has an «implements» dependency to the logical part it realizes. The same interface contracts as the logical architecture are realized here: a provider port (Out) and a consumer port (In) on the physical parts that play those roles. Logical counterparts live in LogicalCounterparts so the physical whitebox stays clean. */

  interface def DirectionCommand {
    doc /* Steering command, same contract as the logical architecture. Steering wheel to drive computer, drive computer to wheels. */
  }
  interface def GearCommand {
    doc /* Gear selection, same contract as the logical architecture. Gear selector to drive computer, drive computer to engine computer. */
  }
  interface def TorqueRequest {
    doc /* Torque request, same contract as the logical architecture. The accelerator provides it and the drive computer consumes it. */
  }
  interface def TorqueCommand {
    doc /* Arbitrated torque, same contract as the logical architecture. The drive computer provides it and the engine computer consumes it. */
  }
  interface def BrakeRequest {
    doc /* Brake request, same contract as the logical architecture. The brake pedal provides it and the drive computer consumes it. */
  }
  interface def BrakeCommand {
    doc /* Friction brake pressure, same contract as the logical architecture. The drive computer provides it and the brake calipers consume it. */
  }
  interface def StartRequest {
    doc /* Start or stop, same contract as the logical architecture. The start button provides it and the vehicle computer consumes it. */
  }
  interface def Credential {
    doc /* Driver credential, same contract as the logical architecture. The key fob provides it and the vehicle computer consumes it. */
  }
  interface def DriveEnable {
    doc /* Immobilizer release, same contract as the logical architecture. The vehicle computer provides it and the drive computer consumes it. */
  }
  interface def LockCommand {
    doc /* Latch command, same contract as the logical architecture. The body computer provides it and the door locks consume it. */
  }
  interface def DoorCommand {
    doc /* Door command, same contract as the logical architecture. The body computer provides it and the door assembly consumes it. */
  }
  interface def WindowCommand {
    doc /* Window command, same contract as the logical architecture. The body computer provides it and the window lift assembly consumes it. */
  }
  interface def LampCommand {
    doc /* Lamp command, same contract as the logical architecture. The body computer provides it and the lamp units consume it. */
  }
  interface def WipeCommand {
    doc /* Wipe command, same contract as the logical architecture. The body computer provides it and the wiper assembly consumes it. */
  }
  interface def DriverFeedback {
    doc /* Driver feedback, same contract as the logical architecture. The vehicle computer provides it and the instrument cluster unit consumes it. */
  }
  interface def EnergySupply {
    doc /* Traction energy, same contract as the logical architecture. The battery controller provides it. The motor, climate hardware, display, lamps and window lifts consume it. */
  }
  interface def ChargeFeed {
    doc /* External charge energy, same contract as the logical architecture. The charge inlet provides it and the battery controller consumes it. */
  }
  interface def WindshieldClear {
    doc /* Wiping action, same contract as the logical architecture. The wiper assembly provides it and the windshield consumes it. */
  }

  package LogicalCounterparts {
    doc /* Logical architecture counterparts referenced by «implements» from VehiclePhysical. Kept outside the physical whitebox so PhysicalView stays mechanical/software only. */

    #Logical ref part car {
      doc /* Logical Car. The whole physical car implements this assembly. */
    }
    #Logical ref part keyFob {
      doc /* Logical key fob, from the logical architecture. */
    }
    #Logical ref part startButton {
      doc /* Logical start button, from the logical architecture. */
    }
    #Logical ref part steeringWheel {
      doc /* Logical steering wheel, from the logical architecture. */
    }
    #Logical ref part gearStick {
      doc /* Logical gear stick, from the logical architecture. */
    }
    #Logical ref part acceleratorPedal {
      doc /* Logical accelerator pedal, from the logical architecture. */
    }
    #Logical ref part brakePedal {
      doc /* Logical brake pedal, from the logical architecture. */
    }
    #Logical ref part vehicleController {
      doc /* Logical vehicle controller, from the logical architecture. */
    }
    #Logical ref part driveController {
      doc /* Logical drive controller, from the logical architecture. */
    }
    #Logical ref part bodyController {
      doc /* Logical body controller, from the logical architecture. */
    }
    #Logical ref part instrumentCluster {
      doc /* Logical instrument cluster, from the logical architecture. */
    }
    #Logical ref part climateSystem {
      doc /* Logical climate system, from the logical architecture. */
    }
    #Logical ref part entertainmentSystem {
      doc /* Logical entertainment system, from the logical architecture. */
    }
    #Logical ref part engine {
      doc /* Logical engine (traction motor), from the logical architecture. */
    }
    #Logical ref part battery {
      doc /* Logical battery, from the logical architecture. */
    }
    #Logical ref part chassis {
      doc /* Logical chassis, from the logical architecture. */
    }
    #Logical ref part wheels {
      doc /* Logical wheels, from the logical architecture. */
    }
    #Logical ref part frictionBrakes {
      doc /* Logical friction brakes, from the logical architecture. */
    }
    #Logical ref part suspension {
      doc /* Logical suspension, from the logical architecture. */
    }
    #Logical ref part doors {
      doc /* Logical doors, from the logical architecture. */
    }
    #Logical ref part windows {
      doc /* Logical windows, from the logical architecture. */
    }
    #Logical ref part windowLifts {
      doc /* Logical window lifts, from the logical architecture. */
    }
    #Logical ref part body {
      doc /* Logical body shell (kaross), from the logical architecture. */
    }
    #Logical ref part windshield {
      doc /* Logical windshield, from the logical architecture. */
    }
    #Logical ref part wipers {
      doc /* Logical wipers, from the logical architecture. */
    }
    #Logical ref part locks {
      doc /* Logical locks, from the logical architecture. */
    }
    #Logical ref part lamps {
      doc /* Logical lamps, from the logical architecture. */
    }
    #Logical ref part chargeInlet {
      doc /* Logical charge inlet, from the logical architecture. */
    }
  }

  part def VehiclePhysical {
    doc /* Physical car: embedded controllers with their software, and the mechanical parts. Implements the logical Car. */

    part vehicleEcu {
      doc /* Embedded computer for power modes, authentication and the immobilizer. Implements the logical vehicle controller. Proxy ports expose Credential, StartRequest, DriveEnable and DriverFeedback at the ECU boundary. */
      port credentialIn : Credential;
      port startIn : StartRequest;
      port driveEnableOut : DriveEnable;
      port feedbackOut : DriverFeedback;
      part vehicleControlSw {
        doc /* Software component for vehicle modes, key authentication and driver feedback. Hosted on the vehicle computer. */
        port credentialIn : Credential;
        port startIn : StartRequest;
        port driveEnableOut : DriveEnable;
        port feedbackOut : DriverFeedback;
      }
    }

    part driveEcu {
      doc /* Embedded computer for torque, braking, gear and steering. Implements the logical drive controller. Proxy ports expose the driver inputs and the actuator commands at the ECU boundary. */
      port driveEnableIn : DriveEnable;
      port torqueIn : TorqueRequest;
      port brakeIn : BrakeRequest;
      port gearIn : GearCommand;
      port directionIn : DirectionCommand;
      port torqueCommandOut : TorqueCommand;
      port brakeCommandOut : BrakeCommand;
      port gearCommandOut : GearCommand;
      port directionCommandOut : DirectionCommand;
      part driveControlSw {
        doc /* Software component for torque arbitration, regen blending, gear mode and steering angle. Hosted on the drive computer. */
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
    }

    part bodyEcu {
      doc /* Embedded computer for locks, doors, windows, lamps and wipers. Implements the logical body controller. Proxy ports expose the body commands at the ECU boundary. */
      port lockOut : LockCommand;
      port doorOut : DoorCommand;
      port windowOut : WindowCommand;
      port lampOut : LampCommand;
      port wipeOut : WipeCommand;
      part bodyControlSw {
        doc /* Software component for lock, door, window, lamp and wiper control. Hosted on the body computer. */
        port lockOut : LockCommand;
        port doorOut : DoorCommand;
        port windowOut : WindowCommand;
        port lampOut : LampCommand;
        port wipeOut : WipeCommand;
      }
    }

    part infotainmentEcu {
      doc /* Embedded computer shared by the entertainment software and the climate software. Implements the logical entertainment system and the logical climate system. */
      part entertainmentSw {
        doc /* Software component for the cabin audio and video. Hosted on the infotainment computer. Implements the logical entertainment system. */
      }
      part climateControlSw {
        doc /* Software component for cabin heating, cooling and airflow. Hosted on the infotainment computer, together with entertainment. Implements the logical climate system. */
      }
    }

    part engineEcu {
      doc /* Embedded computer for the traction motor. Separate module. Implements the logical engine. Proxy ports expose GearCommand and TorqueCommand at the ECU boundary. */
      port gearCommandIn : GearCommand;
      port torqueCommandIn : TorqueCommand;
      part engineControlSw {
        doc /* Software component for motor torque and mode. Consumes GearCommand and TorqueCommand from the drive computer. */
        port gearCommandIn : GearCommand;
        port torqueCommandIn : TorqueCommand;
      }
    }

    part batteryEcu {
      doc /* Embedded computer for the traction battery and charging. Separate module. Implements the logical battery. Proxy ports expose EnergySupply and ChargeFeed at the ECU boundary. */
      attribute _icon = "battery";
      port energyOut : EnergySupply;
      port chargeIn : ChargeFeed;
      part batteryControlSw {
        doc /* Software component for battery limits and charge sessions. Provides EnergySupply and consumes ChargeFeed. */
        port energyOut : EnergySupply;
        port chargeIn : ChargeFeed;
      }
    }

    part keyFobUnit {
      doc /* Radio key fob. Provides Credential to the vehicle computer. */
      port credentialOut : Credential;
    }

    part startButtonMech {
      doc /* Push button on the dashboard. Provides StartRequest to the vehicle computer. */
      port startOut : StartRequest;
    }

    part steeringWheelMech {
      doc /* Mechanical steering wheel with angle sensor. Provides DirectionCommand to the drive computer. */
      port directionOut : DirectionCommand;
    }

    part gearStickMech {
      attribute _icon_body = "energy/busbar";
      doc /* Mechanical gear selector for park, reverse, neutral and drive. Provides GearCommand to the drive computer. */
      port gearOut : GearCommand;
    }

    part acceleratorPedalMech {
      doc /* Mechanical accelerator pedal with travel sensor. Provides TorqueRequest to the drive computer. */
      port torqueOut : TorqueRequest;
    }

    part brakePedalMech {
      doc /* Mechanical brake pedal with force sensor. Provides BrakeRequest to the drive computer. */
      port brakeOut : BrakeRequest;
    }

    part instrumentClusterUnit {
      doc /* Display and sounder behind the steering wheel. Consumes DriverFeedback. */
      port feedbackIn : DriverFeedback;
    }

    part hvacAssembly {
      doc /* Mechanical climate hardware: heater, compressor, fans and ducts. Consumes EnergySupply. */
      port energyIn : EnergySupply;
    }

    part displayAndSpeakers {
      doc /* Mechanical and electronic cabin display and speakers. Consumes EnergySupply. */
      port energyIn : EnergySupply;
    }

    part electricMotor {
      doc /* Mechanical traction motor. Consumes EnergySupply. The engine computer commands it. */
      attribute _icon_body = "IconOven/electric-motor";
      port energyIn : EnergySupply;
    }

    part batteryPack {
      attribute _icon_body = "iconmind/battery";
      doc /* Mechanical battery pack. Implements the logical battery. The battery computer manages it. */
    }

    part chassisFrame {
      doc /* Mechanical chassis frame. Implements the logical chassis. */
    }

    part wheelSet {
      doc /* Mechanical road wheels with steering knuckles. Consume DirectionCommand from the drive computer. */
      attribute _icon = "disc";
      port directionCommandIn : DirectionCommand;
    }

    part brakeCaliperAsm {
      doc /* Hydraulic calipers, discs and the brake actuator. Consume BrakeCommand from the drive computer. */
      port brakeCommandIn : BrakeCommand;
    }

    part suspensionAsm {
      doc /* Mechanical suspension. Implements the logical suspension. */
    }

    part doorAsm {
      doc /* Door shells, hinges and position sensors. Consume DoorCommand from the body computer. */
      port doorIn : DoorCommand;
    }

    part windowAsm {
      doc /* Side and rear glass panes. Implements the logical windows. */
    }

    part windowLiftAsm {
      doc /* Window lift motors with pinch sensing. Consume WindowCommand from the body computer and EnergySupply. */
      port windowIn : WindowCommand;
      port energyIn : EnergySupply;
    }

    part bodyShell {
      doc /* Mechanical body shell (kaross). Implements the logical body. */
    }

    part windshieldGlass {
      doc /* Mechanical windshield. Consumes WindshieldClear. */
      port clearIn : WindshieldClear;
    }

    part wiperAsm {
      doc /* Mechanical wiper and washer. Consumes WipeCommand from the body computer and provides WindshieldClear. */
      port wipeIn : WipeCommand;
      port clearOut : WindshieldClear;
    }

    part doorLockAsm {
      doc /* Mechanical door latches with lock motors. Consume LockCommand from the body computer. */
      port lockIn : LockCommand;
    }

    part lampUnits {
      doc /* Mechanical lamp units. Consume LampCommand from the body computer and EnergySupply. */
      port lampIn : LampCommand;
      port energyIn : EnergySupply;
    }

    part chargeInletMech {
      doc /* Mechanical charge inlet socket. Provides ChargeFeed to the battery controller. */
      port chargeOut : ChargeFeed;
    }

    #implements dependency from VehiclePhysical to LogicalCounterparts::car;
    #implements dependency from vehicleEcu to LogicalCounterparts::vehicleController;
    #implements dependency from vehicleEcu.vehicleControlSw to LogicalCounterparts::vehicleController;
    #implements dependency from driveEcu to LogicalCounterparts::driveController;
    #implements dependency from driveEcu.driveControlSw to LogicalCounterparts::driveController;
    #implements dependency from bodyEcu to LogicalCounterparts::bodyController;
    #implements dependency from bodyEcu.bodyControlSw to LogicalCounterparts::bodyController;
    #implements dependency from infotainmentEcu to LogicalCounterparts::entertainmentSystem, LogicalCounterparts::climateSystem;
    #implements dependency from infotainmentEcu.entertainmentSw to LogicalCounterparts::entertainmentSystem;
    #implements dependency from infotainmentEcu.climateControlSw to LogicalCounterparts::climateSystem;
    #implements dependency from engineEcu to LogicalCounterparts::engine;
    #implements dependency from engineEcu.engineControlSw to LogicalCounterparts::engine;
    #implements dependency from batteryEcu to LogicalCounterparts::battery;
    #implements dependency from batteryEcu.batteryControlSw to LogicalCounterparts::battery, LogicalCounterparts::chargeInlet;
    #implements dependency from keyFobUnit to LogicalCounterparts::keyFob;
    #implements dependency from startButtonMech to LogicalCounterparts::startButton;
    #implements dependency from steeringWheelMech to LogicalCounterparts::steeringWheel;
    #implements dependency from gearStickMech to LogicalCounterparts::gearStick;
    #implements dependency from acceleratorPedalMech to LogicalCounterparts::acceleratorPedal;
    #implements dependency from brakePedalMech to LogicalCounterparts::brakePedal;
    #implements dependency from instrumentClusterUnit to LogicalCounterparts::instrumentCluster;
    #implements dependency from hvacAssembly to LogicalCounterparts::climateSystem;
    #implements dependency from displayAndSpeakers to LogicalCounterparts::entertainmentSystem;
    #implements dependency from electricMotor to LogicalCounterparts::engine;
    #implements dependency from batteryPack to LogicalCounterparts::battery;
    #implements dependency from chassisFrame to LogicalCounterparts::chassis;
    #implements dependency from wheelSet to LogicalCounterparts::wheels;
    #implements dependency from brakeCaliperAsm to LogicalCounterparts::frictionBrakes;
    #implements dependency from suspensionAsm to LogicalCounterparts::suspension;
    #implements dependency from doorAsm to LogicalCounterparts::doors;
    #implements dependency from windowAsm to LogicalCounterparts::windows;
    #implements dependency from windowLiftAsm to LogicalCounterparts::windowLifts;
    #implements dependency from bodyShell to LogicalCounterparts::body;
    #implements dependency from windshieldGlass to LogicalCounterparts::windshield;
    #implements dependency from wiperAsm to LogicalCounterparts::wipers;
    #implements dependency from doorLockAsm to LogicalCounterparts::locks;
    #implements dependency from lampUnits to LogicalCounterparts::lamps;
    #implements dependency from chargeInletMech to LogicalCounterparts::chargeInlet;

    // Internal ECU↔SW bindings (proxy faces on the parent).
    bind vehicleEcu.credentialIn = vehicleEcu.vehicleControlSw.credentialIn;
    bind vehicleEcu.startIn = vehicleEcu.vehicleControlSw.startIn;
    bind vehicleEcu.driveEnableOut = vehicleEcu.vehicleControlSw.driveEnableOut;
    bind vehicleEcu.feedbackOut = vehicleEcu.vehicleControlSw.feedbackOut;
    bind driveEcu.driveEnableIn = driveEcu.driveControlSw.driveEnableIn;
    bind driveEcu.torqueIn = driveEcu.driveControlSw.torqueIn;
    bind driveEcu.brakeIn = driveEcu.driveControlSw.brakeIn;
    bind driveEcu.gearIn = driveEcu.driveControlSw.gearIn;
    bind driveEcu.directionIn = driveEcu.driveControlSw.directionIn;
    bind driveEcu.torqueCommandOut = driveEcu.driveControlSw.torqueCommandOut;
    bind driveEcu.brakeCommandOut = driveEcu.driveControlSw.brakeCommandOut;
    bind driveEcu.gearCommandOut = driveEcu.driveControlSw.gearCommandOut;
    bind driveEcu.directionCommandOut = driveEcu.driveControlSw.directionCommandOut;
    bind bodyEcu.lockOut = bodyEcu.bodyControlSw.lockOut;
    bind bodyEcu.doorOut = bodyEcu.bodyControlSw.doorOut;
    bind bodyEcu.windowOut = bodyEcu.bodyControlSw.windowOut;
    bind bodyEcu.lampOut = bodyEcu.bodyControlSw.lampOut;
    bind bodyEcu.wipeOut = bodyEcu.bodyControlSw.wipeOut;
    bind engineEcu.gearCommandIn = engineEcu.engineControlSw.gearCommandIn;
    bind engineEcu.torqueCommandIn = engineEcu.engineControlSw.torqueCommandIn;
    bind batteryEcu.energyOut = batteryEcu.batteryControlSw.energyOut;
    bind batteryEcu.chargeIn = batteryEcu.batteryControlSw.chargeIn;

    // External peer connections (ECU proxy ports ↔ mechanical peers).
    connection credential connect keyFobUnit.credentialOut to vehicleEcu.credentialIn;
    connection start connect startButtonMech.startOut to vehicleEcu.startIn;
    connection driveEnable connect vehicleEcu.driveEnableOut to driveEcu.driveEnableIn;
    connection feedback connect vehicleEcu.feedbackOut to instrumentClusterUnit.feedbackIn;
    connection steerInput connect steeringWheelMech.directionOut to driveEcu.directionIn;
    connection direction connect driveEcu.directionCommandOut to wheelSet.directionCommandIn;
    connection gearInput connect gearStickMech.gearOut to driveEcu.gearIn;
    connection gear connect driveEcu.gearCommandOut to engineEcu.gearCommandIn;
    connection torqueRequest connect acceleratorPedalMech.torqueOut to driveEcu.torqueIn;
    connection torque connect driveEcu.torqueCommandOut to engineEcu.torqueCommandIn;
    connection brakeRequest connect brakePedalMech.brakeOut to driveEcu.brakeIn;
    connection brake connect driveEcu.brakeCommandOut to brakeCaliperAsm.brakeCommandIn;
    connection lock connect bodyEcu.lockOut to doorLockAsm.lockIn;
    connection door connect bodyEcu.doorOut to doorAsm.doorIn;
    connection window connect bodyEcu.windowOut to windowLiftAsm.windowIn;
    connection lamp connect bodyEcu.lampOut to lampUnits.lampIn;
    connection wipe connect bodyEcu.wipeOut to wiperAsm.wipeIn;
    connection energyMotor connect batteryEcu.energyOut to electricMotor.energyIn;
    connection energyClimate connect batteryEcu.energyOut to hvacAssembly.energyIn;
    connection energyEntertainment connect batteryEcu.energyOut to displayAndSpeakers.energyIn;
    connection energyLamps connect batteryEcu.energyOut to lampUnits.energyIn;
    connection energyWindows connect batteryEcu.energyOut to windowLiftAsm.energyIn;
    connection charge connect chargeInletMech.chargeOut to batteryEcu.chargeIn;
    connection clear connect wiperAsm.clearOut to windshieldGlass.clearIn;
  }

  view def PhysicalView : GeneralView {
    doc /* Physical whitebox. Software nested in its computer, mechanical parts beside them, provider and consumer ports with their connections. Climate and entertainment share infotainmentEcu. */
    expose VehiclePhysical;
    filter @PartUsage or @PortUsage or @ConnectionUsage or @BindingConnectorAsUsage;
  }

  view def PhysicalDependenciesView : GeneralView {
    doc /* Physical parts and their «implements» dependencies to LogicalCounterparts (connections filtered out). */
    expose VehiclePhysical;
    expose LogicalCounterparts;
    filter @PartUsage or @Dependency;
  }

  view def PhysicalTree : TreeView {
    doc /* Containment tree of the physical car, including software hosted on each computer. */
    expose VehiclePhysical;
  }
}
