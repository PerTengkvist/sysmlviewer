package PhysicalArchitecture {
  doc /* Physical architecture of the electric car. Software components run on embedded controllers. Climate and entertainment share one computer. Maneuvrability, engine and battery each have their own. Everything else is mechanical. Every physical part has an «implements» dependency to the logical part it realizes. The same interface contracts as the logical architecture are realized here: a provider port (Out) and a consumer port (In) on the physical parts that play those roles. Parts marked «Logical» are the logical counterparts, drawn here so the realization is visible. */

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
      doc /* Embedded computer for steering. Separate from the other controllers. Implements the logical steering wheel's control path. */
      part maneuvrabilityControlSw {
        doc /* Software component for steering angle and directional control. Consumes the driver's DirectionCommand and provides it to the wheels. */
        port directionIn : DirectionCommand;
        port directionOut : DirectionCommand;
      }
    }

    part engineEcu {
      doc /* Embedded computer for the traction motor. Separate module. Implements the logical engine. */
      part engineControlSw {
        doc /* Software component for motor torque and mode. Consumes GearCommand and TorqueRequest. */
        port gearIn : GearCommand;
        port torqueIn : TorqueRequest;
      }
    }

    part batteryEcu {
      doc /* Embedded computer for the traction battery and charging. Separate module. Implements the logical battery. */
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
      port energyIn : EnergySupply;
    }

    part batteryPack {
      doc /* Mechanical battery pack. Implements the logical battery. The battery computer manages it. */
    }

    part chassisFrame {
      doc /* Mechanical chassis frame. Implements the logical chassis. */
    }

    part wheelSet {
      doc /* Mechanical road wheels. Consume DirectionCommand and BrakeRequest. */
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

    #implements dependency from VehiclePhysical to car;
    #implements dependency from infotainmentEcu to entertainmentSystem, climateSystem;
    #implements dependency from infotainmentEcu.entertainmentSw to entertainmentSystem;
    #implements dependency from infotainmentEcu.climateControlSw to climateSystem;
    #implements dependency from maneuvrabilityEcu to steeringWheel;
    #implements dependency from maneuvrabilityEcu.maneuvrabilityControlSw to steeringWheel;
    #implements dependency from engineEcu to engine;
    #implements dependency from engineEcu.engineControlSw to engine;
    #implements dependency from batteryEcu to battery;
    #implements dependency from batteryEcu.batteryControlSw to battery, chargeInlet;
    #implements dependency from steeringWheelMech to steeringWheel;
    #implements dependency from gearStickMech to gearStick;
    #implements dependency from acceleratorPedalMech to acceleratorPedal;
    #implements dependency from brakePedalMech to brakePedal;
    #implements dependency from hvacAssembly to climateSystem;
    #implements dependency from displayAndSpeakers to entertainmentSystem;
    #implements dependency from electricMotor to engine;
    #implements dependency from batteryPack to battery;
    #implements dependency from chassisFrame to chassis;
    #implements dependency from wheelSet to wheels;
    #implements dependency from suspensionAsm to suspension;
    #implements dependency from windowAsm to windows;
    #implements dependency from bodyShell to body;
    #implements dependency from windshieldGlass to windshield;
    #implements dependency from wiperAsm to wipers;
    #implements dependency from doorLockAsm to locks;
    #implements dependency from lampUnits to lamps;
    #implements dependency from chargeInletMech to chargeInlet;

    connection direction connect maneuvrabilityEcu.maneuvrabilityControlSw.directionOut to wheelSet.directionIn;
    connection steerInput connect steeringWheelMech.directionOut to maneuvrabilityEcu.maneuvrabilityControlSw.directionIn;
    connection gear connect gearStickMech.gearOut to engineEcu.engineControlSw.gearIn;
    connection torque connect acceleratorPedalMech.torqueOut to engineEcu.engineControlSw.torqueIn;
    connection brake connect brakePedalMech.brakeOut to wheelSet.brakeIn;
    connection energyMotor connect batteryEcu.batteryControlSw.energyOut to electricMotor.energyIn;
    connection energyClimate connect batteryEcu.batteryControlSw.energyOut to hvacAssembly.energyIn;
    connection energyEntertainment connect batteryEcu.batteryControlSw.energyOut to displayAndSpeakers.energyIn;
    connection energyLamps connect batteryEcu.batteryControlSw.energyOut to lampUnits.energyIn;
    connection charge connect chargeInletMech.chargeOut to batteryEcu.batteryControlSw.chargeIn;
    connection clear connect wiperAsm.clearOut to windshieldGlass.clearIn;
  }

  view def PhysicalView : GeneralView {
    doc /* Physical whitebox. Software nested in its computer, mechanical parts beside them, provider and consumer ports with their connections, and «implements» arrows to the «Logical» counterparts. Climate and entertainment share infotainmentEcu. */
    expose VehiclePhysical;
  }

  view def PhysicalTree : TreeView {
    doc /* Containment tree of the physical car, including software hosted on each computer. */
    expose VehiclePhysical;
  }
}
