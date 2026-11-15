package Functions {
  doc /* Functional architecture of the electric car. Each top-level part is a function the car performs for its users; the parts nested inside it are the functional entities the function decomposes into. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Each function also «refine»s the use cases it carries out; those dependencies are collected in the FunctionTraceability package. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. Every functional entity is allocated to exactly one logical part, and a logical part comprises one or more entities. That allocation is how the logical architecture is synthesized from the use cases. Each function has one or more action flows, and every step of a flow is performed by one of the function's functional entities; a FlowView per flow shows it with the performer on each step. */
  abstract part def Function {
    doc /* Base of the functions the car performs. A function is decomposed into FunctionNode entities and has at least one action flow that those entities perform. */
  }
  abstract part def FunctionNode {
    doc /* A functional entity: a part of a function that performs steps of the function's flows. Every FunctionNode is allocated to exactly one logical part. */
  }
  part def Security :> Function {
    doc /* Authenticate the driver, unlock and lock the car, release the immobilizer, and let occupants open the doors and move the windows of an unlocked car. Every driving function depends on Security before the car will move. Two flows: securityFlow from key fob to a car that is ready to start, and cabinAccessFlow from a door handle or window switch to a door or window that has moved. */
    part authenticate : FunctionNode {
      doc /* Check the key fob credential before any unlock, lock or start. Allocated to the vehicle controller. */
      perform securityFlow.checkCredential;
      perform securityFlow.rejectKey;
    }
    part immobilizer : FunctionNode {
      doc /* Keep propulsion inhibited until the driver is authenticated and the start button is pressed. Allocated to the vehicle controller. */
      perform securityFlow.releaseImmobilizer;
    }
    part wakeUp : FunctionNode {
      doc /* Bring the cabin systems out of sleep when the car unlocks. Allocated to the vehicle controller. */
      perform securityFlow.wakeCabin;
    }
    part lockControl : FunctionNode {
      doc /* Own the door latches: engage and release them on request and confirm every change with the indicators. Allocated to the body controller. */
      perform securityFlow.unlockDoors;
      perform cabinAccessFlow.checkUnlocked;
      perform cabinAccessFlow.stayLatched;
    }
    part doorControl : FunctionNode {
      doc /* Own the doors: read the inside and outside handles, open a door once its latch is free, and report each door open or closed. Allocated to the body controller. */
      perform cabinAccessFlow.readDoorHandle;
      perform cabinAccessFlow.releaseDoor;
    }
    part windowControl : FunctionNode {
      doc /* Own the side windows: run each window lift on its switch and reverse a window that pinches. Allocated to the body controller. */
      perform cabinAccessFlow.runWindowLift;
    }
    part driverInformation : FunctionNode {
      doc /* Tell the driver what state the car is in: ready, gear, speed, charge and warnings. Allocated to the instrument cluster. */
      perform securityFlow.showReady;
      perform cabinAccessFlow.showDoorState;
    }
    action securityFlow {
      doc /* From a key fob credential to a car that is ready to start. A valid key unlocks the doors, wakes the cabin, releases the immobilizer and tells the driver; any other key is rejected and the car stays locked. */
      action checkCredential {
        doc /* Input: the challenge response the key fob sends to the car's antennas. Compared with the keys paired to the car; the outcome is the credentialValid decision. */
      }
      action unlockDoors {
        doc /* When the credential is valid: every door latch is released and the indicators flash once, so the driver sees the car has accepted the key. */
      }
      action wakeCabin {
        doc /* After the doors unlock: the cabin bus comes out of sleep, so the display and controls respond by the time the driver is seated. */
      }
      action releaseImmobilizer {
        doc /* Once the cabin is awake: the propulsion inhibit is lifted, so the next press on the start button can make the car Ready. */
      }
      action showReady {
        doc /* Last step of a valid unlock: the instrument cluster shows that the car is unlocked and can be started. */
      }
      action rejectKey {
        doc /* When the credential is unknown or expired: it is discarded, the doors stay locked and the immobilizer stays engaged. */
      }
      first start;
      then checkCredential;
      then if credentialValid then unlockDoors else rejectKey;
      first unlockDoors then wakeCabin;
      first wakeCabin then releaseImmobilizer;
      first releaseImmobilizer then showReady;
      first showReady then done;
      first rejectKey then done;
    }
    action cabinAccessFlow {
      doc /* From a door handle or a window switch to a door or window that has moved. A door opens only on an unlocked car; a locked car keeps it latched. A window follows its switch, and the driver sees which doors are open. */
      action readDoorHandle {
        doc /* When the request comes from a door: the pull on its inside or outside handle is read. Output: the door the occupant wants to open. */
      }
      action checkUnlocked {
        doc /* Before that door may open: the state of the latches is read; the outcome is the carUnlocked decision. */
      }
      action releaseDoor {
        doc /* On an unlocked car: the latch of the requested door lets go and the door swings open. */
      }
      action stayLatched {
        doc /* On a locked car: the pull is ignored and the door stays latched, so the car cannot be entered without the key. */
      }
      action showDoorState {
        doc /* After the door has moved: the door-ajar warning is shown while it is open and cleared once it is closed and latched again. */
      }
      action runWindowLift {
        doc /* When the request comes from a window switch: the window lowers or rises while the switch is held, and backs off if it meets an obstacle on the way up. */
      }
      first start;
      then if doorRequested then readDoorHandle else runWindowLift;
      first readDoorHandle then checkUnlocked;
      then if carUnlocked then releaseDoor else stayLatched;
      first releaseDoor then showDoorState;
      first showDoorState then done;
      first stayLatched then done;
      first runWindowLift then done;
    }
  }

  part def Charging :> Function {
    doc /* Take energy from a home or fast charger and store it in the battery. Speed control, climate, entertainment, lighting and windshield cleaning draw on this energy. */
    part chargeConnection : FunctionNode {
      doc /* Detect the plug and carry the charger's energy into the car. Allocated to the charge inlet. */
      perform chargingFlow.detectPlug;
      perform chargingFlow.transferEnergy;
    }
    part chargeSession : FunctionNode {
      doc /* Negotiate current with the charger and stop at the target state of charge. Allocated to the battery. */
      perform chargingFlow.negotiateCurrent;
      perform chargingFlow.stopAtTarget;
    }
    part energyStorage : FunctionNode {
      doc /* Store traction energy and publish the discharge limit. Allocated to the battery. */
      perform chargingFlow.storeEnergy;
    }
    action chargingFlow {
      doc /* One charging session: from plugging in to stopping at the target state of charge. */
      action detectPlug {
        doc /* Starts the session: the inlet senses a charger plug and locks it in place. Output: plug present and locked. */
      }
      action negotiateCurrent {
        doc /* With the plug locked: the car offers the charger the current the battery can accept right now, and both agree on a limit. */
      }
      action transferEnergy {
        doc /* Within the agreed limit: charging current flows from the charger through the inlet to the battery. */
      }
      action storeEnergy {
        doc /* Input: the charging current. The cells take up the energy and the state of charge is updated. */
      }
      action stopAtTarget {
        doc /* When the state of charge reaches the driver's target: the charger is told to stop and the plug is unlocked. */
      }
      first start;
      then detectPlug;
      then negotiateCurrent;
      then transferEnergy;
      then storeEnergy;
      then stopAtTarget;
      then done;
    }
  }

  part def SpeedControl :> Function {
    doc /* Command traction torque and braking, including regenerative braking, so the driver can set and hold speed. Depends on Security for the immobilizer and on Charging for energy. */
    part torqueArbitration : FunctionNode {
      doc /* Turn pedal travel into a torque command bounded by the battery limit. Allocated to the drive controller. */
      perform speedControlFlow.arbitrateTorque;
    }
    part regenBlending : FunctionNode {
      doc /* Split a deceleration request between regenerative torque and friction pressure. Allocated to the drive controller. */
      perform speedControlFlow.blendRegen;
    }
    part tractionDrive : FunctionNode {
      doc /* Convert electrical power into torque at the wheels. Allocated to the engine. */
      perform speedControlFlow.driveWheels;
    }
    part frictionBraking : FunctionNode {
      doc /* Apply hydraulic brake pressure, with anti-lock modulation in an emergency stop. Allocated to the friction brakes. */
      perform speedControlFlow.applyFriction;
    }
    action speedControlFlow {
      doc /* From pedal travel to torque at the wheels. When the driver brakes, the deceleration is blended between regeneration and friction; otherwise the traction drive turns the wheels. */
      action arbitrateTorque {
        doc /* Input: accelerator and brake pedal positions and the battery's power limit. Output: a torque request, negative while the driver brakes; that sign is the braking decision. */
      }
      action blendRegen {
        doc /* While braking: as much of the requested deceleration as the battery can absorb is taken as regenerative torque; the remainder goes on to friction braking. */
      }
      action applyFriction {
        doc /* Input: the deceleration regeneration could not take. It is applied as hydraulic pressure at the wheels, modulated if a wheel starts to lock. */
      }
      action driveWheels {
        doc /* When not braking: the requested torque is drawn from the battery and delivered to the driven wheels. */
      }
      first start;
      then arbitrateTorque;
      then if braking then blendRegen else driveWheels;
      first blendRegen then applyFriction;
      first applyFriction then done;
      first driveWheels then done;
    }
  }

  part def Maneuvrability :> Function {
    doc /* Steer the car left and right, select the direction of travel, and keep it directionally stable. Depends on Security, and on SpeedControl because steering response changes with speed. */
    part steeringControl : FunctionNode {
      doc /* Turn the steering wheel angle into a wheel angle. Allocated to the drive controller. */
      perform maneuvrabilityFlow.steerWheels;
    }
    part gearSelection : FunctionNode {
      doc /* Accept park, reverse, neutral or drive only when it is safe. Allocated to the drive controller. */
      perform maneuvrabilityFlow.selectGear;
    }
    part roadHolding : FunctionNode {
      doc /* Keep the tyres on the road over bumps and in corners. Allocated to the suspension. */
      perform maneuvrabilityFlow.holdRoad;
    }
    action maneuvrabilityFlow {
      doc /* Choose the direction of travel, steer, and keep the car on the road. */
      action selectGear {
        doc /* Input: the gear selector position and the vehicle speed. Output: the engaged direction of travel; a change that is unsafe at the current speed is refused. */
      }
      action steerWheels {
        doc /* With a direction engaged: the road wheels follow the steering wheel angle, with less assistance as speed rises. */
      }
      action holdRoad {
        doc /* While the car moves: body motion over bumps and in corners is damped so that all four tyres keep contact with the road. */
      }
      first start;
      then selectGear;
      then steerWheels;
      then holdRoad;
      then done;
    }
  }

  part def Entertainment :> Function {
    doc /* Play audio and video for the driver and passengers. Depends on Security so the cabin systems wake only for an authorized user, and on Charging for power. */
    part mediaPlayback : FunctionNode {
      doc /* Select and play titles on the cabin display and speakers. Allocated to the entertainment system. */
      perform entertainmentFlow.selectTitle;
      perform entertainmentFlow.playMedia;
    }
    action entertainmentFlow {
      doc /* Pick something to play and play it in the cabin. */
      action selectTitle {
        doc /* Input: a choice on the cabin display by the driver or a passenger. Output: the title to play. */
      }
      action playMedia {
        doc /* The chosen title streams to the display and speakers until it ends or another title is chosen. */
      }
      first start;
      then selectTitle;
      then playMedia;
      then done;
    }
  }

  part def Climate :> Function {
    doc /* Heat, cool and demist the cabin. Depends on Charging because the compressor and heater are electric. */
    part cabinTemperature : FunctionNode {
      doc /* Hold the cabin at the set temperature with heater, compressor and fans. Allocated to the climate system. */
      perform climateFlow.readSetpoint;
      perform climateFlow.conditionCabin;
    }
    action climateFlow {
      doc /* Bring the cabin to the temperature the occupants asked for. */
      action readSetpoint {
        doc /* Input: the set temperature and fan level on the climate controls. Output: the target the cabin is conditioned to. */
      }
      action conditionCabin {
        doc /* The cabin temperature is compared with the target, and heating or cooling runs until they match; the glass is demisted if it fogs. */
      }
      first start;
      then readSetpoint;
      then conditionCabin;
      then done;
    }
  }

  part def WindshieldCleaning :> Function {
    doc /* Wipe and wash the windshield so the driver can see. Depends on Charging for the wiper motor and on SpeedControl so the wipe rate can follow vehicle speed. */
    part wipeControl : FunctionNode {
      doc /* Own the driver's wipe and wash request and decide how fast the blades run and when to wash. Allocated to the body controller. */
      perform windshieldCleaningFlow.readStalk;
    }
    part wipeSweep : FunctionNode {
      doc /* Sweep the glass and park the blades. Allocated to the wipers. */
      perform windshieldCleaningFlow.sweepGlass;
      perform windshieldCleaningFlow.parkBlades;
    }
    action windshieldCleaningFlow {
      doc /* From the stalk position to a clean windshield and parked blades. */
      action readStalk {
        doc /* Input: the stalk position (off, intermittent, slow, fast or wash). Output: the requested wipe speed and any washer pulse. */
      }
      action sweepGlass {
        doc /* At the requested speed: the blades cross the glass, with washer fluid sprayed on a wash pulse. */
      }
      action parkBlades {
        doc /* When the stalk returns to off: the current sweep is finished and the blades stop in their rest position below the windshield. */
      }
      first start;
      then readStalk;
      then sweepGlass;
      then parkBlades;
      then done;
    }
  }

  part def Lighting :> Function {
    doc /* Headlamps, tail lamps, brake lamps and direction indicators. Depends on Security and Charging. Indicators also depend on Maneuvrability because they follow the intended turn. */
    part headlampControl : FunctionNode {
      doc /* Switch low and high beam on and off. Allocated to the body controller. */
      perform lightingFlow.selectLamps;
    }
    part indicatorControl : FunctionNode {
      doc /* Flash direction indicators, brake lamps and hazard lights. Allocated to the body controller. */
      perform lightingFlow.flashIndicators;
    }
    part lampDrive : FunctionNode {
      doc /* Light the lamp units. Allocated to the lamps. */
      perform lightingFlow.lightLamps;
    }
    action lightingFlow {
      doc /* From the light switch and indicator stalk to lit lamp units. */
      action selectLamps {
        doc /* Input: the light switch and the high-beam stalk. Output: which headlamps should be lit. */
      }
      action flashIndicators {
        doc /* Input: the indicator stalk, the hazard switch and the brake pedal. Output: which direction indicators flash and whether the brake lamps are lit. */
      }
      action lightLamps {
        doc /* The lamp units chosen in the two previous steps are powered; all others are switched off. */
      }
      first start;
      then selectLamps;
      then flashIndicators;
      then lightLamps;
      then done;
    }
  }

  #Authorize dependency from SpeedControl to Security;
  #Energy dependency from SpeedControl to Charging;
  #Authorize dependency from Maneuvrability to Security;
  #Stability dependency from Maneuvrability to SpeedControl;
  #Authorize dependency from Entertainment to Security;
  #Energy dependency from Entertainment to Charging;
  #Energy dependency from Climate to Charging;
  #Energy dependency from WindshieldCleaning to Charging;
  #Speed dependency from WindshieldCleaning to SpeedControl;
  #Authorize dependency from Lighting to Security;
  #Energy dependency from Lighting to Charging;
  #Indicate dependency from Lighting to Maneuvrability;


  allocate Security::authenticate to LogicalArchitecture::Car::vehicleController;
  allocate Security::immobilizer to LogicalArchitecture::Car::vehicleController;
  allocate Security::wakeUp to LogicalArchitecture::Car::vehicleController;
  allocate Security::lockControl to LogicalArchitecture::Car::bodyController;
  allocate Security::doorControl to LogicalArchitecture::Car::bodyController;
  allocate Security::windowControl to LogicalArchitecture::Car::bodyController;
  allocate Security::driverInformation to LogicalArchitecture::Car::instrumentCluster;
  allocate Charging::chargeConnection to LogicalArchitecture::Car::chargeInlet;
  allocate Charging::chargeSession to LogicalArchitecture::Car::battery;
  allocate Charging::energyStorage to LogicalArchitecture::Car::battery;
  allocate SpeedControl::torqueArbitration to LogicalArchitecture::Car::driveController;
  allocate SpeedControl::regenBlending to LogicalArchitecture::Car::driveController;
  allocate SpeedControl::tractionDrive to LogicalArchitecture::Car::engine;
  allocate SpeedControl::frictionBraking to LogicalArchitecture::Car::frictionBrakes;
  allocate Maneuvrability::steeringControl to LogicalArchitecture::Car::driveController;
  allocate Maneuvrability::gearSelection to LogicalArchitecture::Car::driveController;
  allocate Maneuvrability::roadHolding to LogicalArchitecture::Car::suspension;
  allocate Entertainment::mediaPlayback to LogicalArchitecture::Car::entertainmentSystem;
  allocate Climate::cabinTemperature to LogicalArchitecture::Car::climateSystem;
  allocate WindshieldCleaning::wipeControl to LogicalArchitecture::Car::bodyController;
  allocate WindshieldCleaning::wipeSweep to LogicalArchitecture::Car::wipers;
  allocate Lighting::headlampControl to LogicalArchitecture::Car::bodyController;
  allocate Lighting::indicatorControl to LogicalArchitecture::Car::bodyController;
  allocate Lighting::lampDrive to LogicalArchitecture::Car::lamps;

  view FunctionsView : GeneralView {
    doc /* Functional dependency view. Arrows are «Authorize», «Energy», «Stability», «Speed» and «Indicate» dependencies between functions. Allocations are filtered out; see FunctionAllocationView. */
    expose Functions;
    filter @PartUsage or @Dependency;
  }

  view FunctionAllocationView : GeneralView {
    doc /* Functional entities and the logical parts they are allocated to. One logical part comprises one or more entities. */
    expose Functions;
    filter @PartUsage or @AllocationUsage;
  }

  view SecurityFlowView : ActionFlowView {
    doc /* Security flow: credential check, then unlock, wake-up, immobilizer release and ready indication, or rejection of the key. Each step shows the functional entity that performs it. */
    expose Security::securityFlow;
  }

  view SecurityCabinAccessFlowView : ActionFlowView {
    doc /* Security cabin access flow: a door handle is read, checked against the latches and the door released or kept latched, or a window is moved on its switch. Each step shows the functional entity that performs it. */
    expose Security::cabinAccessFlow;
  }

  view ChargingFlowView : ActionFlowView {
    doc /* Charging flow: plug detection, current negotiation, energy transfer and storage, and stop at the target. Each step shows the functional entity that performs it. */
    expose Charging::chargingFlow;
  }

  view SpeedControlFlowView : ActionFlowView {
    doc /* Speed control flow: torque arbitration, then blended regenerative and friction braking or traction drive. Each step shows the functional entity that performs it. */
    expose SpeedControl::speedControlFlow;
  }

  view ManeuvrabilityFlowView : ActionFlowView {
    doc /* Maneuvrability flow: gear selection, steering and road holding. Each step shows the functional entity that performs it. */
    expose Maneuvrability::maneuvrabilityFlow;
  }

  view EntertainmentFlowView : ActionFlowView {
    doc /* Entertainment flow: title selection and playback. Each step shows the functional entity that performs it. */
    expose Entertainment::entertainmentFlow;
  }

  view ClimateFlowView : ActionFlowView {
    doc /* Climate flow: setpoint reading and cabin conditioning. Each step shows the functional entity that performs it. */
    expose Climate::climateFlow;
  }

  view WindshieldCleaningFlowView : ActionFlowView {
    doc /* Windshield cleaning flow: stalk reading, sweeping and blade parking. Each step shows the functional entity that performs it. */
    expose WindshieldCleaning::windshieldCleaningFlow;
  }

  view LightingFlowView : ActionFlowView {
    doc /* Lighting flow: lamp selection, indicators and lamp drive. Each step shows the functional entity that performs it. */
    expose Lighting::lightingFlow;
  }
}

package FunctionTraceability {
  doc /* Traceability from the functions to the use cases they carry out. Each function «refine»s the use cases it realizes, so a use case's objective requirement is reached from the function, from its functional entities and from the logical parts those entities are allocated to. Drive and Park are composites and are reached through the use cases they include. TurnLeft and TurnRight are refined by both Maneuvrability (steering) and Lighting (direction indicators), and Brake by both SpeedControl (deceleration) and Lighting (brake lamps). The dependencies live outside Functions so that FunctionsView keeps showing only the dependencies between functions. */
  #refine dependency from Functions::Security to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::Security to UseCases::Driving::StopVehicle;
  #refine dependency from Functions::Security to UseCases::Managing::Unlock;
  #refine dependency from Functions::Security to UseCases::Managing::Lock;
  #refine dependency from Functions::Security to UseCases::Managing::OpenDoor;
  #refine dependency from Functions::Security to UseCases::Managing::CloseDoor;
  #refine dependency from Functions::Security to UseCases::Managing::OpenWindow;
  #refine dependency from Functions::Security to UseCases::Managing::CloseWindow;
  #refine dependency from Functions::Charging to UseCases::Managing::Charge;
  #refine dependency from Functions::SpeedControl to UseCases::Driving::Accelerate;
  #refine dependency from Functions::SpeedControl to UseCases::Driving::Brake;
  #refine dependency from Functions::SpeedControl to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::Maneuvrability to UseCases::Driving::ChangeGear;
  #refine dependency from Functions::Maneuvrability to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Maneuvrability to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Lighting to UseCases::Driving::ToggleHeadlights;
  #refine dependency from Functions::Lighting to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Lighting to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Lighting to UseCases::Driving::Brake;
  #refine dependency from Functions::WindshieldCleaning to UseCases::Driving::CleanWindshield;
  #refine dependency from Functions::Climate to UseCases::Managing::AdjustClimate;
  #refine dependency from Functions::Entertainment to UseCases::Managing::PlayMedia;
}
