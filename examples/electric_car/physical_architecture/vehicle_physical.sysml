package PhysicalArchitecture {
  doc /* Physical architecture of the electric car. Software components run on embedded controllers. Climate and entertainment share one computer. Maneuvrability, engine and battery each have their own. Everything else is mechanical. Every physical part has an «implements» dependency to the logical part it realizes. The same interface contracts as the logical architecture are realized here: a provider port (Out) and a consumer port (In) on the physical parts that play those roles. Logical counterparts live in LogicalCounterparts so the physical whitebox stays clean. */

  interface def DirectionCommand {
    doc /* Steering command, same contract as the logical architecture. The maneuvrability controller provides it and the wheels consume it. */
  }
  interface def GearCommand {
    doc /* Gear selection, same contract as the logical architecture. The gear selector provides it and the engine controller consumes it. */
  }
  interface def TorqueRequest {
    doc /* Torque request, same contract as the logical architecture. The accelerator provides it and the engine controller consumes it. */
  }
  interface def BrakeRequest {
    doc /* Brake request, same contract as the logical architecture. The brake pedal provides it and the wheels consume it. */
  }
  interface def EnergySupply {
    doc /* Traction energy, same contract as the logical architecture. The battery controller provides it. The motor, climate hardware, display and lamps consume it. */
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
    #Logical ref part suspension {
      doc /* Logical suspension, from the logical architecture. */
    }
    #Logical ref part windows {
      doc /* Logical windows, from the logical architecture. */
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

    part infotainmentEcu {
      doc /* Embedded computer shared by the entertainment software and the climate software. Implements the logical entertainment system and the logical climate system. */
      part entertainmentSw {
        doc /* Software component for the cabin audio and video. Hosted on the infotainment computer. Implements the logical entertainment system. */
      }
      part climateControlSw {
        doc /* Software component for cabin heating, cooling and airflow. Hosted on the infotainment computer, together with entertainment. Implements the logical climate system. */
      }
    }

    part maneuvrabilityEcu {
      doc /* Embedded computer for steering. Separate from the other controllers. Implements the logical steering wheel's control path. Proxy ports expose DirectionCommand at the ECU boundary. */
      port directionIn : DirectionCommand;
      port directionOut : DirectionCommand;
      part maneuvrabilityControlSw {
        doc /* Software component for steering angle and directional control. Consumes the driver's DirectionCommand and provides it to the wheels. */
        port directionIn : DirectionCommand;
        port directionOut : DirectionCommand;
      }
    }

    part engineEcu {
      doc /* Embedded computer for the traction motor. Separate module. Implements the logical engine. Proxy ports expose GearCommand and TorqueRequest at the ECU boundary. */
      port gearIn : GearCommand;
      port torqueIn : TorqueRequest;
      part engineControlSw {
        doc /* Software component for motor torque and mode. Consumes GearCommand and TorqueRequest. */
        port gearIn : GearCommand;
        port torqueIn : TorqueRequest;
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

    part steeringWheelMech {
      doc /* Mechanical steering wheel. Provides DirectionCommand to the maneuvrability controller. */
      port directionOut : DirectionCommand;
    }

    part gearStickMech {
      doc /* Mechanical gear selector for park, reverse, neutral and drive. Provides GearCommand. */
      port gearOut : GearCommand;
    }

    part acceleratorPedalMech {
      doc /* Mechanical accelerator pedal. Provides TorqueRequest. */
      port torqueOut : TorqueRequest;
    }

    part brakePedalMech {
      doc /* Mechanical brake pedal. Provides BrakeRequest. */
      port brakeOut : BrakeRequest;
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
      doc /* Mechanical road wheels. Consume DirectionCommand and BrakeRequest. */
      attribute _icon = "disc";
      port directionIn : DirectionCommand;
      port brakeIn : BrakeRequest;
    }

    part suspensionAsm {
      doc /* Mechanical suspension. Implements the logical suspension. */
    }

    part windowAsm {
      doc /* Mechanical side and rear windows. Implements the logical windows. */
    }

    part bodyShell {
      doc /* Mechanical body shell (kaross). Implements the logical body. */
    }

    part windshieldGlass {
      doc /* Mechanical windshield. Consumes WindshieldClear. */
      port clearIn : WindshieldClear;
    }

    part wiperAsm {
      doc /* Mechanical wiper and washer. Provides WindshieldClear. */
      port clearOut : WindshieldClear;
    }

    part doorLockAsm {
      doc /* Mechanical door locks. Implements the logical locks. */
    }

    part lampUnits {
      doc /* Mechanical lamp units. Consume EnergySupply. */
      port energyIn : EnergySupply;
    }

    part chargeInletMech {
      doc /* Mechanical charge inlet socket. Provides ChargeFeed to the battery controller. */
      port chargeOut : ChargeFeed;
    }

    #implements dependency from VehiclePhysical to LogicalCounterparts::car;
    #implements dependency from infotainmentEcu to LogicalCounterparts::entertainmentSystem, LogicalCounterparts::climateSystem;
    #implements dependency from infotainmentEcu.entertainmentSw to LogicalCounterparts::entertainmentSystem;
    #implements dependency from infotainmentEcu.climateControlSw to LogicalCounterparts::climateSystem;
    #implements dependency from maneuvrabilityEcu to LogicalCounterparts::steeringWheel;
    #implements dependency from maneuvrabilityEcu.maneuvrabilityControlSw to LogicalCounterparts::steeringWheel;
    #implements dependency from engineEcu to LogicalCounterparts::engine;
    #implements dependency from engineEcu.engineControlSw to LogicalCounterparts::engine;
    #implements dependency from batteryEcu to LogicalCounterparts::battery;
    #implements dependency from batteryEcu.batteryControlSw to LogicalCounterparts::battery, LogicalCounterparts::chargeInlet;
    #implements dependency from steeringWheelMech to LogicalCounterparts::steeringWheel;
    #implements dependency from gearStickMech to LogicalCounterparts::gearStick;
    #implements dependency from acceleratorPedalMech to LogicalCounterparts::acceleratorPedal;
    #implements dependency from brakePedalMech to LogicalCounterparts::brakePedal;
    #implements dependency from hvacAssembly to LogicalCounterparts::climateSystem;
    #implements dependency from displayAndSpeakers to LogicalCounterparts::entertainmentSystem;
    #implements dependency from electricMotor to LogicalCounterparts::engine;
    #implements dependency from batteryPack to LogicalCounterparts::battery;
    #implements dependency from chassisFrame to LogicalCounterparts::chassis;
    #implements dependency from wheelSet to LogicalCounterparts::wheels;
    #implements dependency from suspensionAsm to LogicalCounterparts::suspension;
    #implements dependency from windowAsm to LogicalCounterparts::windows;
    #implements dependency from bodyShell to LogicalCounterparts::body;
    #implements dependency from windshieldGlass to LogicalCounterparts::windshield;
    #implements dependency from wiperAsm to LogicalCounterparts::wipers;
    #implements dependency from doorLockAsm to LogicalCounterparts::locks;
    #implements dependency from lampUnits to LogicalCounterparts::lamps;
    #implements dependency from chargeInletMech to LogicalCounterparts::chargeInlet;

    // Internal ECU↔SW bindings (proxy faces on the parent).
    connection maneuvrabilityDirectionIn connect maneuvrabilityEcu.directionIn to maneuvrabilityEcu.maneuvrabilityControlSw.directionIn;
    connection maneuvrabilityDirectionOut connect maneuvrabilityEcu.maneuvrabilityControlSw.directionOut to maneuvrabilityEcu.directionOut;
    connection engineGearIn connect engineEcu.gearIn to engineEcu.engineControlSw.gearIn;
    connection engineTorqueIn connect engineEcu.torqueIn to engineEcu.engineControlSw.torqueIn;
    connection batteryEnergyOut connect batteryEcu.batteryControlSw.energyOut to batteryEcu.energyOut;
    connection batteryChargeIn connect batteryEcu.chargeIn to batteryEcu.batteryControlSw.chargeIn;

    // External peer connections (ECU proxy ports ↔ mechanical peers).
    connection direction connect maneuvrabilityEcu.directionOut to wheelSet.directionIn;
    connection steerInput connect steeringWheelMech.directionOut to maneuvrabilityEcu.directionIn;
    connection gear connect gearStickMech.gearOut to engineEcu.gearIn;
    connection torque connect acceleratorPedalMech.torqueOut to engineEcu.torqueIn;
    connection brake connect brakePedalMech.brakeOut to wheelSet.brakeIn;
    connection energyMotor connect batteryEcu.energyOut to electricMotor.energyIn;
    connection energyClimate connect batteryEcu.energyOut to hvacAssembly.energyIn;
    connection energyEntertainment connect batteryEcu.energyOut to displayAndSpeakers.energyIn;
    connection energyLamps connect batteryEcu.energyOut to lampUnits.energyIn;
    connection charge connect chargeInletMech.chargeOut to batteryEcu.chargeIn;
    connection clear connect wiperAsm.clearOut to windshieldGlass.clearIn;
  }

  view def PhysicalView : GeneralView {
    doc /* Physical whitebox. Software nested in its computer, mechanical parts beside them, provider and consumer ports with their connections. Climate and entertainment share infotainmentEcu. */
    expose VehiclePhysical;
    filter @PartUsage or @PortUsage or @ConnectionUsage;
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
