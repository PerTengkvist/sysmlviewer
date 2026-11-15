package Functions {
  doc /* Functional architecture of the electric car. Each top-level part is a function the car performs for its users; the parts nested inside it are the functional entities the function decomposes into. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. Every functional entity is allocated to exactly one logical part, and a logical part comprises one or more entities. That allocation is how the logical architecture is synthesized from the use cases. Each function also has an action flow, and every step of it is performed by one of its functional entities; a FlowView per function shows the flow with the performer on each step. */
  abstract part def Function {
    doc /* Base of the functions the car performs. A function is decomposed into FunctionNode entities and has one action flow that those entities perform. */
  }
  abstract part def FunctionNode {
    doc /* A functional entity: a part of a function that performs steps of the function's flow. Every FunctionNode is allocated to exactly one logical part. */
  }
  part def Security :> Function {
    doc /* Authenticate the driver, unlock and lock the doors, and release the immobilizer. Every driving function depends on Security before the car will move. */
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
      doc /* Engage and release the latches and flash the indicators as confirmation. Allocated to the body controller. */
      perform securityFlow.unlockDoors;
    }
    part driverInformation : FunctionNode {
      doc /* Tell the driver what state the car is in: ready, gear, speed, charge and warnings. Allocated to the instrument cluster. */
      perform securityFlow.showReady;
    }
    action securityFlow {
      doc /* From a key fob credential to a car that is ready to start. A valid key unlocks the doors, wakes the cabin, releases the immobilizer and tells the driver; any other key is rejected and the car stays locked. */
      action checkCredential {
        doc /* Read the key fob credential and compare it with the keys paired to the car. */
      }
      action unlockDoors {
        doc /* Release the door latches and flash the indicators as confirmation. */
      }
      action wakeCabin {
        doc /* Bring the cabin systems out of sleep so they are ready when the driver gets in. */
      }
      action releaseImmobilizer {
        doc /* Lift the propulsion inhibit so that the start button can make the car ready. */
      }
      action showReady {
        doc /* Tell the driver that the car is unlocked and can be started. */
      }
      action rejectKey {
        doc /* Ignore an unknown or expired credential and keep the doors locked. */
      }
      first start;
      then checkCredential;
      then if credentialValid then unlockDoors else rejectKey;
      first unlockDoors then wakeCabin;
      then releaseImmobilizer;
      then showReady;
      then done;
      first rejectKey then done;
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
        doc /* Detect that a charger plug is inserted and locked in the inlet. */
      }
      action negotiateCurrent {
        doc /* Agree with the charger on the current the battery can accept. */
      }
      action transferEnergy {
        doc /* Carry the charger's energy through the inlet into the car. */
      }
      action storeEnergy {
        doc /* Store the energy in the battery cells and update the state of charge. */
      }
      action stopAtTarget {
        doc /* End the session when the battery reaches the target state of charge. */
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
        doc /* Turn pedal travel into a torque request bounded by the battery limit. */
      }
      action blendRegen {
        doc /* Take as much of the deceleration as possible as regenerative torque. */
      }
      action applyFriction {
        doc /* Apply hydraulic pressure for the rest of the deceleration, with anti-lock modulation. */
      }
      action driveWheels {
        doc /* Convert electrical power into the requested torque at the wheels. */
      }
      first start;
      then arbitrateTorque;
      then if braking then blendRegen else driveWheels;
      first blendRegen then applyFriction;
      then done;
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
        doc /* Accept park, reverse, neutral or drive only when it is safe. */
      }
      action steerWheels {
        doc /* Turn the steering wheel angle into a wheel angle. */
      }
      action holdRoad {
        doc /* Keep the tyres on the road over bumps and in corners. */
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
        doc /* Let the driver or a passenger choose a title on the cabin display. */
      }
      action playMedia {
        doc /* Play the title on the cabin display and speakers. */
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
        doc /* Read the set temperature and fan level from the climate controls. */
      }
      action conditionCabin {
        doc /* Heat, cool or demist with heater, compressor and fans until the cabin holds the setpoint. */
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
      doc /* Turn the stalk position into wipe speed and washer pulses. Allocated to the body controller. */
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
        doc /* Turn the stalk position into a wipe speed and washer pulses. */
      }
      action sweepGlass {
        doc /* Sweep the blades over the glass at the requested speed. */
      }
      action parkBlades {
        doc /* Return the blades to their rest position when wiping stops. */
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
        doc /* Choose low or high beam from the light switch. */
      }
      action flashIndicators {
        doc /* Flash the direction indicators, brake lamps or hazard lights as requested. */
      }
      action lightLamps {
        doc /* Drive the lamp units that were selected. */
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
