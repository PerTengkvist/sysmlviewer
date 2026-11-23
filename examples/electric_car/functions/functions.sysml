package Functions {
  doc /* Functional architecture of the electric car. Each top-level part is a function the car performs for its users; the parts nested inside it are the functional entities the function decomposes into. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Each function realizes the use cases it carries out: a step of its flows «refine»s the use case step it carries out, and those dependencies are collected in the FunctionTraceability package. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. Every functional entity is allocated to exactly one logical part, and a logical part comprises one or more entities. That allocation is how the logical architecture is synthesized from the use cases. Each function has one or more action flows, and every step of a flow is performed by one of the function's functional entities; a FlowView per flow shows it with the performer on each step. */
  abstract part def Function {
    doc /* Base of the functions the car performs. A function is decomposed into FunctionNode entities and has at least one action flow that those entities perform. */
  }
  abstract part def FunctionNode {
    doc /* A functional entity: a part of a function that performs steps of the function's flows. Every FunctionNode is allocated to exactly one logical part. */
  }
  part def Security :> Function {
    doc /* Authenticate the key, unlock and lock the car, hold the immobilizer until the car is started, switch the car on and off, and let occupants open the doors and move the windows of an unlocked car. Every driving function depends on Security before the car will move. Five flows: securityFlow unlocks the car with the key fob and lockFlow locks it; startFlow makes the car Ready and stopFlow switches it off again; cabinAccessFlow moves a door or a window. Only startFlow releases the immobilizer, so an unlocked car cannot drive until an approved key starts it. */
    part authenticate : FunctionNode {
      doc /* Check the key fob credential before any unlock or lock, and look for an approved key in the cabin before a start. Allocated to the vehicle controller. */
      perform securityFlow.checkCredential;
      perform securityFlow.rejectKey;
      perform lockFlow.checkCredential;
      perform startFlow.checkKeyInCabin;
    }
    part immobilizer : FunctionNode {
      doc /* Keep propulsion inhibited from the moment the car is switched off until an approved key starts it again; unlocking the doors does not release it. Allocated to the vehicle controller. */
      perform startFlow.releaseImmobilizer;
      perform stopFlow.armImmobilizer;
    }
    part powerControl : FunctionNode {
      doc /* Own the power mode: read the start button, switch high voltage on and off, enable and disable the drive, and refuse a start or a stop that is not allowed. Allocated to the vehicle controller. */
      perform startFlow.readStartRequest;
      perform startFlow.switchOnHighVoltage;
      perform startFlow.enableDrive;
      perform startFlow.refuseStart;
      perform stopFlow.readStopRequest;
      perform stopFlow.disableDrive;
      perform stopFlow.switchOffHighVoltage;
      perform stopFlow.keepReady;
    }
    part wakeUp : FunctionNode {
      doc /* Bring the cabin systems out of sleep when the car unlocks. Allocated to the vehicle controller. */
      perform securityFlow.wakeCabin;
    }
    part lockControl : FunctionNode {
      doc /* Own the door latches: engage and release them on request, confirm every change with the indicators, and leave the car unlocked when locking is not possible. Allocated to the body controller. */
      perform securityFlow.unlockDoors;
      perform lockFlow.engageLatches;
      perform lockFlow.confirmLock;
      perform lockFlow.keepUnlocked;
      perform cabinAccessFlow.checkUnlocked;
      perform cabinAccessFlow.stayLatched;
      perform cabinAccessFlow.relatch;
    }
    part doorControl : FunctionNode {
      doc /* Own the doors: read the inside and outside handles, open a door once its latch is free, report each door open or closed, and tell the lock whether every door is shut. Allocated to the body controller. */
      perform cabinAccessFlow.readDoorHandle;
      perform cabinAccessFlow.releaseDoor;
      perform cabinAccessFlow.closeDoor;
      perform cabinAccessFlow.keepDoorAjar;
      perform lockFlow.checkDoorsClosed;
    }
    part windowControl : FunctionNode {
      doc /* Own the side windows: run each window lift on its switch and reverse a window that pinches. Allocated to the body controller. */
      perform cabinAccessFlow.runWindowLift;
    }
    action securityFlow {
      doc /* From a press on unlock to an unlocked car. A valid key unlocks the doors and wakes the cabin; any other key is rejected and the car stays locked. The immobilizer stays engaged either way: only startFlow releases it. */
      action checkCredential {
        doc /* Input: the challenge response the key fob sends to the car's antennas when unlock is pressed. Compared with the keys paired to the car; the outcome is the credentialValid decision. */
      }
      action unlockDoors {
        doc /* When the credential is valid: every door latch is released and the indicators flash once, so the driver sees the car has accepted the key. */
      }
      action wakeCabin {
        doc /* After the doors unlock: the cabin bus comes out of sleep, so the display and controls respond by the time the driver is seated. Propulsion stays inhibited. */
      }
      action rejectKey {
        doc /* When the credential is unknown or expired: it is discarded, the doors stay locked and the immobilizer stays engaged. */
      }
      first start;
      then checkCredential;
      then if credentialValid then unlockDoors else rejectKey;
      first unlockDoors then wakeCabin;
      first wakeCabin then done;
      first rejectKey then done;
    }
    action lockFlow {
      doc /* From a press on lock to a locked car. The key is checked first, then every door must be shut: the latches engage and the indicators confirm it, or the car stays unlocked without a confirmation. */
      action checkCredential {
        doc /* Input: the challenge response the key fob sends when lock is pressed. Compared with the keys paired to the car before any latch moves. */
      }
      action checkDoorsClosed {
        doc /* With the key accepted: the position of every door is read; the outcome is the doorsClosed decision. */
      }
      action engageLatches {
        doc /* Every door is shut: all door latches engage at once. */
      }
      action confirmLock {
        doc /* Once the latches hold: the indicators flash, so the driver sees from outside that the car is locked. */
      }
      action keepUnlocked {
        doc /* A door is still open: no latch moves and the indicators stay dark, so the driver sees the car is not locked. */
      }
      first start;
      then checkCredential;
      then checkDoorsClosed;
      then if doorsClosed then engageLatches else keepUnlocked;
      first engageLatches then confirmLock;
      first confirmLock then done;
      first keepUnlocked then done;
    }
    action startFlow {
      doc /* From a press on the start button to a car that is Ready. With the brake held and an approved key in the cabin, the immobilizer is released, high voltage comes on and the drive is enabled; otherwise the start is refused and the car stays Off. */
      action readStartRequest {
        doc /* Input: the start button press and the brake pedal switch. Output: a start request and the brakeHeld decision. */
      }
      action checkKeyInCabin {
        doc /* With the brake held: the cabin antennas look for a paired key inside the car; the outcome is the keyApproved decision. */
      }
      action releaseImmobilizer {
        doc /* The key is approved: the propulsion inhibit is lifted, so the drive may accept torque once it is live. */
      }
      action switchOnHighVoltage {
        doc /* With the inhibit lifted: the battery's high-voltage contactor closes and the traction circuit is live. */
      }
      action enableDrive {
        doc /* With high voltage on: the drive is told the car is Ready and starts answering the pedals. */
      }
      action refuseStart {
        doc /* The brake is not held or no approved key is found: nothing is switched on, the car stays Off and the reason is passed on to the cluster. */
      }
      first start;
      then readStartRequest;
      then if brakeHeld then checkKeyInCabin else refuseStart;
      first checkKeyInCabin;
      then if keyApproved then releaseImmobilizer else refuseStart;
      first releaseImmobilizer then switchOnHighVoltage;
      first switchOnHighVoltage then enableDrive;
      first enableDrive then done;
      first refuseStart then done;
    }
    action stopFlow {
      doc /* From a press on the start button in a Ready car to a car that is Off. With park selected the drive is disabled, high voltage goes off and the immobilizer is armed again; in any other gear the car stays Ready. */
      action readStopRequest {
        doc /* Input: the start button press while the car is Ready, and the gear the drive reports. Output: a stop request and the parkSelected decision. */
      }
      action disableDrive {
        doc /* Park is selected: the drive stops answering the pedals. */
      }
      action switchOffHighVoltage {
        doc /* With the drive disabled: the high-voltage contactor opens and the traction circuit is dead. */
      }
      action armImmobilizer {
        doc /* Last step of a shutdown: the propulsion inhibit is set again, so the car cannot move until the next approved start. */
      }
      action keepReady {
        doc /* Another gear is selected: nothing is switched off, the car stays Ready and the cluster is asked to prompt for park. */
      }
      first start;
      then readStopRequest;
      then if parkSelected then disableDrive else keepReady;
      first disableDrive then switchOffHighVoltage;
      first switchOffHighVoltage then armImmobilizer;
      first armImmobilizer then done;
      first keepReady then done;
    }
    action cabinAccessFlow {
      doc /* From a door handle or a window switch to a door or window that has moved. An inside handle always opens its door, so nobody can be shut in; an outside handle opens it only on an unlocked car. A door pushed shut is latched again, or reported still open if it did not catch; a window follows its switch. */
      action readDoorHandle {
        doc /* When the request comes from a door: the pull on a handle is read. Output: the door to open and whether the handle was outside or inside, the outsideHandle decision. */
      }
      action checkUnlocked {
        doc /* For an outside handle only: the state of the latches is read; the outcome is the carUnlocked decision. */
      }
      action releaseDoor {
        doc /* From inside always, from outside on an unlocked car: the latch of the requested door lets go and the door swings open. */
      }
      action stayLatched {
        doc /* Outside handle on a locked car: the pull is ignored and the door stays latched, so the car cannot be entered without the key. */
      }
      action closeDoor {
        doc /* The occupant swings the open door shut; its position sensor reports it closed. */
      }
      action relatch {
        doc /* The door is shut: its latch catches and holds it, so the car can be locked again. */
      }
      action keepDoorAjar {
        doc /* The door did not shut fully: its latch has not caught, so the door is still reported open and the car cannot be locked. */
      }
      action runWindowLift {
        doc /* When the request comes from a window switch: the window lowers or rises while the switch is held, and backs off if it meets an obstacle on the way up. */
      }
      first start;
      then if doorRequested then readDoorHandle else runWindowLift;
      first readDoorHandle;
      then if outsideHandle then checkUnlocked else releaseDoor;
      first checkUnlocked;
      then if carUnlocked then releaseDoor else stayLatched;
      first releaseDoor then closeDoor;
      first closeDoor;
      then if doorLatched then relatch else keepDoorAjar;
      first relatch then done;
      first keepDoorAjar then done;
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
      doc /* One charging session: from plugging in to stopping, at the target state of charge or when the driver ends it. */
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
        doc /* When the state of charge reaches the driver's target, or the driver ends the session: the charger is told to stop and the plug is unlocked. */
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
        doc /* Input: accelerator and brake pedal positions and the battery's power limit. Output: a torque request within that limit, so a cold or nearly empty battery gives less torque and a warning; the request is negative while the driver brakes, and that sign is the braking decision. */
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
    doc /* Steer the car left and right, select the direction of travel, and keep it directionally stable. Two flows, one per trigger: maneuvrabilityFlow from the steering wheel to the road wheels, and gearSelectionFlow from the gear selector to a gear that is engaged or refused. Depends on Security, and on SpeedControl because steering response and gear changes depend on speed. */
    part steeringControl : FunctionNode {
      doc /* Turn the steering wheel angle into a wheel angle. Allocated to the drive controller. */
      perform maneuvrabilityFlow.steerWheels;
    }
    part gearSelection : FunctionNode {
      doc /* Accept park, reverse, neutral or drive only when it is safe. Allocated to the drive controller. */
      perform gearSelectionFlow.selectGear;
      perform gearSelectionFlow.engageGear;
      perform gearSelectionFlow.refuseGear;
    }
    part roadHolding : FunctionNode {
      doc /* Keep the tyres on the road over bumps and in corners. Allocated to the suspension. */
      perform maneuvrabilityFlow.holdRoad;
    }
    action maneuvrabilityFlow {
      doc /* Steer and keep the car on the road: the road wheels follow the steering wheel while the suspension keeps the tyres in contact. */
      action steerWheels {
        doc /* With a direction engaged: the road wheels follow the steering wheel angle, with less assistance as speed rises. */
      }
      action holdRoad {
        doc /* While the car moves: body motion over bumps and in corners is damped so that all four tyres keep contact with the road. */
      }
      first start;
      then steerWheels;
      then holdRoad;
      then done;
    }
    action gearSelectionFlow {
      doc /* From the gear selector to the direction of travel: a safe change is engaged, an unsafe one is refused and the gear stays as it was. */
      action selectGear {
        doc /* Input: the gear selector position, the vehicle speed and the brake pedal. Output: the requested gear and the changeSafe decision. */
      }
      action engageGear {
        doc /* The change is safe: the motor is set to the new direction of travel, or park is locked, and the engaged gear is reported. */
      }
      action refuseGear {
        doc /* The change is unsafe at this speed or without the brake: the current gear is kept and the refusal is reported as a warning. */
      }
      first start;
      then selectGear;
      then if changeSafe then engageGear else refuseGear;
      first engageGear then done;
      first refuseGear then done;
    }
  }

  part def Entertainment :> Function {
    doc /* Play audio and video for the driver and passengers. Depends on Security so the cabin systems wake only for an authorized user, and on Charging for power. */
    part mediaPlayback : FunctionNode {
      doc /* Select and play titles on the cabin display and speakers. Allocated to the entertainment system. */
      perform entertainmentFlow.selectTitle;
      perform entertainmentFlow.playMedia;
      perform entertainmentFlow.stopPlayback;
    }
    action entertainmentFlow {
      doc /* Pick something to play, play it in the cabin, and stop. */
      action selectTitle {
        doc /* Input: a choice on the cabin display by the driver or a passenger. Output: the title to play. */
      }
      action playMedia {
        doc /* The chosen title streams to the display and speakers until it ends or another title is chosen. */
      }
      action stopPlayback {
        doc /* The title ends or an occupant stops it: the stream stops and the speakers fall silent. */
      }
      first start;
      then selectTitle;
      then playMedia;
      then stopPlayback;
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
      doc /* Spray washer fluid, sweep the glass and park the blades. Allocated to the wipers. */
      perform windshieldCleaningFlow.sprayWasher;
      perform windshieldCleaningFlow.sweepGlass;
      perform windshieldCleaningFlow.parkBlades;
    }
    action windshieldCleaningFlow {
      doc /* From the stalk position to a clean windshield and parked blades; a wash request sprays the glass before the sweep. */
      action readStalk {
        doc /* Input: the stalk position (off, intermittent, slow, fast or wash). Output: the requested wipe speed and any washer pulse. */
      }
      action sprayWasher {
        doc /* Wash is selected: the washer pump sprays fluid onto the glass ahead of the blades. */
      }
      action sweepGlass {
        doc /* At the requested speed: the blades cross the glass. */
      }
      action parkBlades {
        doc /* When the stalk returns to off: the current sweep is finished and the blades stop in their rest position below the windshield. */
      }
      first start;
      then readStalk;
      then if washSelected then sprayWasher else sweepGlass;
      first sprayWasher then sweepGlass;
      first sweepGlass then parkBlades;
      first parkBlades then done;
    }
  }

  part def Lighting :> Function {
    doc /* Headlamps, tail lamps, brake lamps, direction indicators and hazard lights. Three flows, one per trigger: lightingFlow for the light switch, indicatorFlow for a turn or a hazard, and brakeLampFlow for the brake pedal. Depends on Security and Charging. Indicators also depend on Maneuvrability because they follow the intended turn. */
    part headlampControl : FunctionNode {
      doc /* Switch low and high beam on and off. Allocated to the body controller. */
      perform lightingFlow.selectLamps;
    }
    part indicatorControl : FunctionNode {
      doc /* Decide which direction indicators, hazard lights and brake lamps are lit, from the indicator stalk and the steering intention, the hazard switch, an emergency stop and the brake pedal. Allocated to the body controller. */
      perform indicatorFlow.readIndicatorRequest;
      perform brakeLampFlow.readBrakeRequest;
    }
    part lampDrive : FunctionNode {
      doc /* Power the lamp units on and off. Allocated to the lamps. */
      perform lightingFlow.lightLamps;
      perform lightingFlow.switchOffLamps;
      perform indicatorFlow.flashIndicator;
      perform indicatorFlow.flashHazards;
      perform brakeLampFlow.lightBrakeLamps;
    }
    action lightingFlow {
      doc /* From the light switch to headlamps that are lit or dark. */
      action selectLamps {
        doc /* Input: the light switch and the high-beam stalk. Output: which headlamps should be lit, and the lampsOn decision. */
      }
      action lightLamps {
        doc /* Headlamps are selected: the chosen low or high beams and the tail lamps are powered. */
      }
      action switchOffLamps {
        doc /* The switch is off: headlamps and tail lamps go dark. */
      }
      first start;
      then selectLamps;
      then if lampsOn then lightLamps else switchOffLamps;
      first lightLamps then done;
      first switchOffLamps then done;
    }
    action indicatorFlow {
      doc /* From a turn or a hazard to flashing lamps: the indicators on the side the driver steers to, or all of them as hazard lights. */
      action readIndicatorRequest {
        doc /* Input: the indicator stalk, the steering intention, the hazard switch and an emergency stop. Output: the side to flash, or the hazard decision. */
      }
      action flashIndicator {
        doc /* For a turn: the indicators on one side flash until the turn is complete. */
      }
      action flashHazards {
        doc /* For a hazard: every indicator flashes together until the hazard is cleared. */
      }
      first start;
      then readIndicatorRequest;
      then if hazard then flashHazards else flashIndicator;
      first flashHazards then done;
      first flashIndicator then done;
    }
    action brakeLampFlow {
      doc /* From the brake pedal to lit brake lamps, so traffic behind sees the car slow down. */
      action readBrakeRequest {
        doc /* Input: the brake pedal switch and the deceleration request. Output: whether the brake lamps must be lit. */
      }
      action lightBrakeLamps {
        doc /* While the car brakes: the brake lamps are lit, and they go dark when the pedal is released. */
      }
      first start;
      then readBrakeRequest;
      then lightBrakeLamps;
      then done;
    }
  }

  part def DriverFeedback :> Function {
    doc /* Tell the driver on the instrument cluster what the car is doing: power mode, gear, speed, beam, doors, set temperature, state of charge and warnings. Many use cases end with such an indication, so their steps are realized by a step of another function together with a step of DriverFeedback. It is a function of its own, and depends on no other function, because the cluster runs on 12 V and shows the locked car too: a broken cluster takes away the indications, not the car. Named after the DriverFeedback interface the cluster consumes. Four flows, one per kind of indication: driverFeedbackFlow for driving, powerModeFlow, cabinStatusFlow and chargeStatusFlow. */
    part driverInformation : FunctionNode {
      doc /* Drive the instrument cluster: turn what the other functions report into the symbols, values and warnings the driver sees. Allocated to the instrument cluster. */
      perform powerModeFlow.showPrompt;
      perform powerModeFlow.showPowerMode;
      perform driverFeedbackFlow.showGear;
      perform driverFeedbackFlow.showSpeed;
      perform driverFeedbackFlow.showBeamSymbol;
      perform driverFeedbackFlow.showWarnings;
      perform cabinStatusFlow.showDoorState;
      perform cabinStatusFlow.showSetpoint;
      perform chargeStatusFlow.showStateOfCharge;
      perform chargeStatusFlow.showFinalCharge;
    }
    action powerModeFlow {
      doc /* From a start or stop request to what the cluster shows: the new power mode, or why the request was refused. */
      action showPrompt {
        doc /* The request was refused: the cluster says what is missing, the brake, an approved key or park. */
      }
      action showPowerMode {
        doc /* The request went through: the cluster shows Ready after a start and goes dark after a stop. */
      }
      first start;
      then if refused then showPrompt else showPowerMode;
      first showPrompt then done;
      first showPowerMode then done;
    }
    action driverFeedbackFlow {
      doc /* The main flow, one refresh of the driving display: gear, speed, beam symbol and warnings, each as the controllers report it. */
      action showGear {
        doc /* Input: the gear that is engaged. The cluster shows P, R, N or D. */
      }
      action showSpeed {
        doc /* Input: the vehicle speed. The cluster shows it as it changes. */
      }
      action showBeamSymbol {
        doc /* Input: the headlamps that are lit. The cluster shows the low or high beam symbol, or none. */
      }
      action showWarnings {
        doc /* Input: the warnings other functions raise, such as a refused gear change or limited power. Each is shown until it clears. */
      }
      first start;
      then showGear;
      then showSpeed;
      then showBeamSymbol;
      then showWarnings;
      then done;
    }
    action cabinStatusFlow {
      doc /* One refresh of the cabin indications: which doors stand open and the set temperature. */
      action showDoorState {
        doc /* Input: each door reported open or closed. The door-ajar warning is shown while a door stands open and cleared once it is latched again. */
      }
      action showSetpoint {
        doc /* Input: the set temperature, passed on from the climate controls. The cluster shows it while it is being changed. */
      }
      first start;
      then showDoorState;
      then showSetpoint;
      then done;
    }
    action chargeStatusFlow {
      doc /* From a charging session to what the driver sees: the state of charge while energy flows, and the result when the session ends. */
      action showStateOfCharge {
        doc /* While energy flows: the cluster shows the state of charge and the time left. */
      }
      action showFinalCharge {
        doc /* When the session stops: the cluster shows the state of charge reached and that the plug is released. */
      }
      first start;
      then showStateOfCharge;
      then showFinalCharge;
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
  allocate DriverFeedback::driverInformation to LogicalArchitecture::Car::instrumentCluster;
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
  allocate Security::powerControl to LogicalArchitecture::Car::vehicleController;

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
    doc /* Security flow: credential check, then unlock and wake-up, or rejection of the key. The immobilizer is not released here. Each step shows the functional entity that performs it. */
    expose Security::securityFlow;
  }

  view SecurityLockFlowView : ActionFlowView {
    doc /* Security lock flow: credential check and door check, then latches and confirmation, or the car stays unlocked. Each step shows the functional entity that performs it. */
    expose Security::lockFlow;
  }

  view SecurityStartFlowView : ActionFlowView {
    doc /* Security start flow: start request, brake and key check, then immobilizer release, high voltage and drive enable, or a refused start. Each step shows the functional entity that performs it. */
    expose Security::startFlow;
  }

  view SecurityStopFlowView : ActionFlowView {
    doc /* Security stop flow: stop request and gear check, then drive disable, high voltage off and immobilizer armed, or the car stays Ready. Each step shows the functional entity that performs it. */
    expose Security::stopFlow;
  }

  view SecurityCabinAccessFlowView : ActionFlowView {
    doc /* Security cabin access flow: a door handle is read; an inside handle opens the door at once, an outside handle only on an unlocked car; the door is closed and latched again; or a window is moved on its switch. Each step shows the functional entity that performs it. */
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
    doc /* Maneuvrability flow: steering and road holding. Each step shows the functional entity that performs it. */
    expose Maneuvrability::maneuvrabilityFlow;
  }

  view ManeuvrabilityGearSelectionFlowView : ActionFlowView {
    doc /* Maneuvrability gear selection flow: gear request, then the gear is engaged or refused. Each step shows the functional entity that performs it. */
    expose Maneuvrability::gearSelectionFlow;
  }

  view EntertainmentFlowView : ActionFlowView {
    doc /* Entertainment flow: title selection, playback and stop. Each step shows the functional entity that performs it. */
    expose Entertainment::entertainmentFlow;
  }

  view ClimateFlowView : ActionFlowView {
    doc /* Climate flow: setpoint reading and cabin conditioning. Each step shows the functional entity that performs it. */
    expose Climate::climateFlow;
  }

  view WindshieldCleaningFlowView : ActionFlowView {
    doc /* Windshield cleaning flow: stalk reading, washer spray on a wash request, sweeping and blade parking. Each step shows the functional entity that performs it. */
    expose WindshieldCleaning::windshieldCleaningFlow;
  }

  view LightingFlowView : ActionFlowView {
    doc /* Lighting flow: lamp selection, then the headlamps are lit or switched off. Each step shows the functional entity that performs it. */
    expose Lighting::lightingFlow;
  }

  view LightingIndicatorFlowView : ActionFlowView {
    doc /* Lighting indicator flow: indicator request, then the indicators on one side or the hazard lights flash. Each step shows the functional entity that performs it. */
    expose Lighting::indicatorFlow;
  }

  view LightingBrakeLampFlowView : ActionFlowView {
    doc /* Lighting brake lamp flow: brake request and brake lamps. Each step shows the functional entity that performs it. */
    expose Lighting::brakeLampFlow;
  }

  view DriverFeedbackFlowView : ActionFlowView {
    doc /* Driver feedback flow: gear, speed, beam symbol and warnings on the cluster. Each step shows the functional entity that performs it. */
    expose DriverFeedback::driverFeedbackFlow;
  }

  view DriverFeedbackPowerModeFlowView : ActionFlowView {
    doc /* Driver feedback power mode flow: the new power mode, or the reason a start or stop was refused. Each step shows the functional entity that performs it. */
    expose DriverFeedback::powerModeFlow;
  }

  view DriverFeedbackCabinStatusFlowView : ActionFlowView {
    doc /* Driver feedback cabin status flow: door-ajar warning and set temperature. Each step shows the functional entity that performs it. */
    expose DriverFeedback::cabinStatusFlow;
  }

  view DriverFeedbackChargeStatusFlowView : ActionFlowView {
    doc /* Driver feedback charge status flow: state of charge while charging and the result when the session ends. Each step shows the functional entity that performs it. */
    expose DriverFeedback::chargeStatusFlow;
  }
}

package FunctionTraceability {
  doc /* Traceability from the functions to the use cases they carry out. The main form is a «refine» from a function step to the use case step it realizes: every system step of a use case is realized by one or more function steps, and a function step that reads an actor's input refines that actor's step. The function, its functional entities and the logical parts they are allocated to follow from those links, through ownership, perform and allocate. The explicit «refine»s from each function and each functional entity to its use cases, the form used before step links, are kept alongside; check_sysml reports any difference between them and the steps (explicit-mismatch). Drive and Park are composites and are reached through the use cases they include. Several use cases are realized by more than one function: TurnLeft and TurnRight by Maneuvrability (steering) and Lighting (indicators), Brake and EmergencyStop by SpeedControl (deceleration) and Lighting (brake lamps, hazard lights), and every use case that ends with an indication on the cluster also by DriverFeedback. A logical part climbs through the entity allocated to it to the use cases that entity serves. */
  // Kept outside Functions: FunctionsView exposes Functions with a filter that
  // pulls in dependency endpoints, and it should show only the dependencies
  // between functions.
  // Function level.
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

  // Entity level: each functional entity refines the use cases it serves.
  #refine dependency from Functions::Security::authenticate to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::Security::authenticate to UseCases::Managing::Unlock;
  #refine dependency from Functions::Security::authenticate to UseCases::Managing::Lock;
  #refine dependency from Functions::Security::immobilizer to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::Security::immobilizer to UseCases::Driving::StopVehicle;
  #refine dependency from Functions::Security::wakeUp to UseCases::Managing::Unlock;
  #refine dependency from Functions::Security::lockControl to UseCases::Managing::Lock;
  #refine dependency from Functions::Security::lockControl to UseCases::Managing::Unlock;
  #refine dependency from Functions::Security::lockControl to UseCases::Managing::OpenDoor;
  #refine dependency from Functions::Security::lockControl to UseCases::Managing::CloseDoor;
  #refine dependency from Functions::Security::doorControl to UseCases::Managing::OpenDoor;
  #refine dependency from Functions::Security::doorControl to UseCases::Managing::CloseDoor;
  #refine dependency from Functions::Security::windowControl to UseCases::Managing::OpenWindow;
  #refine dependency from Functions::Security::windowControl to UseCases::Managing::CloseWindow;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Driving::StopVehicle;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Managing::OpenDoor;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Managing::CloseDoor;
  #refine dependency from Functions::Charging::chargeConnection to UseCases::Managing::Charge;
  #refine dependency from Functions::Charging::chargeSession to UseCases::Managing::Charge;
  #refine dependency from Functions::Charging::energyStorage to UseCases::Managing::Charge;
  #refine dependency from Functions::SpeedControl::torqueArbitration to UseCases::Driving::Accelerate;
  #refine dependency from Functions::SpeedControl::torqueArbitration to UseCases::Driving::Brake;
  #refine dependency from Functions::SpeedControl::regenBlending to UseCases::Driving::Brake;
  #refine dependency from Functions::SpeedControl::tractionDrive to UseCases::Driving::Accelerate;
  #refine dependency from Functions::SpeedControl::frictionBraking to UseCases::Driving::Brake;
  #refine dependency from Functions::SpeedControl::frictionBraking to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::Maneuvrability::steeringControl to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Maneuvrability::steeringControl to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Maneuvrability::gearSelection to UseCases::Driving::ChangeGear;
  #refine dependency from Functions::Maneuvrability::roadHolding to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Maneuvrability::roadHolding to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Lighting::headlampControl to UseCases::Driving::ToggleHeadlights;
  #refine dependency from Functions::Lighting::indicatorControl to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Lighting::indicatorControl to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Lighting::indicatorControl to UseCases::Driving::Brake;
  #refine dependency from Functions::Lighting::lampDrive to UseCases::Driving::ToggleHeadlights;
  #refine dependency from Functions::Lighting::lampDrive to UseCases::Driving::TurnLeft;
  #refine dependency from Functions::Lighting::lampDrive to UseCases::Driving::TurnRight;
  #refine dependency from Functions::Lighting::lampDrive to UseCases::Driving::Brake;
  #refine dependency from Functions::WindshieldCleaning::wipeControl to UseCases::Driving::CleanWindshield;
  #refine dependency from Functions::WindshieldCleaning::wipeSweep to UseCases::Driving::CleanWindshield;
  #refine dependency from Functions::Climate::cabinTemperature to UseCases::Managing::AdjustClimate;
  #refine dependency from Functions::Entertainment::mediaPlayback to UseCases::Managing::PlayMedia;

  // DriverFeedback: the indications that use cases of other functions end with.
  #refine dependency from Functions::DriverFeedback to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::DriverFeedback to UseCases::Driving::StopVehicle;
  #refine dependency from Functions::DriverFeedback to UseCases::Driving::ChangeGear;
  #refine dependency from Functions::DriverFeedback to UseCases::Driving::Accelerate;
  #refine dependency from Functions::DriverFeedback to UseCases::Driving::ToggleHeadlights;
  #refine dependency from Functions::DriverFeedback to UseCases::Managing::OpenDoor;
  #refine dependency from Functions::DriverFeedback to UseCases::Managing::CloseDoor;
  #refine dependency from Functions::DriverFeedback to UseCases::Managing::AdjustClimate;
  #refine dependency from Functions::DriverFeedback to UseCases::Managing::Charge;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Driving::ChangeGear;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Driving::Accelerate;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Driving::ToggleHeadlights;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Managing::AdjustClimate;
  #refine dependency from Functions::DriverFeedback::driverInformation to UseCases::Managing::Charge;
  // Entities that switch the car on and off, and check the doors before it locks.
  #refine dependency from Functions::Security::powerControl to UseCases::Driving::StartVehicle;
  #refine dependency from Functions::Security::powerControl to UseCases::Driving::StopVehicle;
  #refine dependency from Functions::Security::doorControl to UseCases::Managing::Lock;
  // EmergencyStop: the torque request, regeneration and the hazard lights.
  #refine dependency from Functions::Lighting to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::SpeedControl::torqueArbitration to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::SpeedControl::regenBlending to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::Lighting::indicatorControl to UseCases::Driving::EmergencyStop;
  #refine dependency from Functions::Lighting::lampDrive to UseCases::Driving::EmergencyStop;

  // Step level: each function step refines the use case steps it realizes. Function by
  // function in the order above, and within a function use case by use case.
  // Security.
  #refine dependency from Functions::Security::startFlow::readStartRequest to UseCases::Driving::StartVehicle::pressStart;
  #refine dependency from Functions::Security::startFlow::checkKeyInCabin to UseCases::Driving::StartVehicle::checkKey;
  #refine dependency from Functions::Security::startFlow::releaseImmobilizer to UseCases::Driving::StartVehicle::showReady;
  #refine dependency from Functions::Security::startFlow::switchOnHighVoltage to UseCases::Driving::StartVehicle::showReady;
  #refine dependency from Functions::Security::startFlow::enableDrive to UseCases::Driving::StartVehicle::showReady;
  #refine dependency from Functions::Security::startFlow::refuseStart to UseCases::Driving::StartVehicle::rejectKey;
  #refine dependency from Functions::Security::startFlow::refuseStart to UseCases::Driving::StartVehicle::askForBrake;
  #refine dependency from Functions::Security::stopFlow::readStopRequest to UseCases::Driving::StopVehicle::pressStart;
  #refine dependency from Functions::Security::stopFlow::disableDrive to UseCases::Driving::StopVehicle::shutDown;
  #refine dependency from Functions::Security::stopFlow::switchOffHighVoltage to UseCases::Driving::StopVehicle::shutDown;
  #refine dependency from Functions::Security::stopFlow::armImmobilizer to UseCases::Driving::StopVehicle::shutDown;
  #refine dependency from Functions::Security::stopFlow::keepReady to UseCases::Driving::StopVehicle::askForPark;
  #refine dependency from Functions::Security::securityFlow::checkCredential to UseCases::Managing::Unlock::pressUnlock;
  #refine dependency from Functions::Security::securityFlow::unlockDoors to UseCases::Managing::Unlock::unlockDoors;
  #refine dependency from Functions::Security::securityFlow::wakeCabin to UseCases::Managing::Unlock::wakeCabin;
  #refine dependency from Functions::Security::securityFlow::rejectKey to UseCases::Managing::Unlock::rejectKey;
  #refine dependency from Functions::Security::lockFlow::checkCredential to UseCases::Managing::Lock::pressLock;
  #refine dependency from Functions::Security::lockFlow::checkDoorsClosed to UseCases::Managing::Lock::lockDoors;
  #refine dependency from Functions::Security::lockFlow::engageLatches to UseCases::Managing::Lock::lockDoors;
  #refine dependency from Functions::Security::lockFlow::confirmLock to UseCases::Managing::Lock::lockDoors;
  #refine dependency from Functions::Security::lockFlow::checkDoorsClosed to UseCases::Managing::Lock::stayUnlocked;
  #refine dependency from Functions::Security::lockFlow::keepUnlocked to UseCases::Managing::Lock::stayUnlocked;
  #refine dependency from Functions::Security::cabinAccessFlow::readDoorHandle to UseCases::Managing::OpenDoor::pullHandle;
  #refine dependency from Functions::Security::cabinAccessFlow::checkUnlocked to UseCases::Managing::OpenDoor::releaseDoor;
  #refine dependency from Functions::Security::cabinAccessFlow::releaseDoor to UseCases::Managing::OpenDoor::releaseDoor;
  #refine dependency from Functions::Security::cabinAccessFlow::checkUnlocked to UseCases::Managing::OpenDoor::stayLatched;
  #refine dependency from Functions::Security::cabinAccessFlow::stayLatched to UseCases::Managing::OpenDoor::stayLatched;
  #refine dependency from Functions::Security::cabinAccessFlow::closeDoor to UseCases::Managing::CloseDoor::pushDoorShut;
  #refine dependency from Functions::Security::cabinAccessFlow::relatch to UseCases::Managing::CloseDoor::clearDoorWarning;
  #refine dependency from Functions::Security::cabinAccessFlow::keepDoorAjar to UseCases::Managing::CloseDoor::keepDoorWarning;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::OpenWindow::holdSwitchDown;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::OpenWindow::lowerWindow;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::CloseWindow::holdSwitchUp;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::CloseWindow::raiseWindow;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::CloseWindow::stopWindow;
  #refine dependency from Functions::Security::cabinAccessFlow::runWindowLift to UseCases::Managing::CloseWindow::reverseWindow;
  // Charging.
  #refine dependency from Functions::Charging::chargingFlow::detectPlug to UseCases::Managing::Charge::connectCharger;
  #refine dependency from Functions::Charging::chargingFlow::negotiateCurrent to UseCases::Managing::Charge::negotiateSession;
  #refine dependency from Functions::Charging::chargingFlow::transferEnergy to UseCases::Managing::Charge::transferEnergy;
  #refine dependency from Functions::Charging::chargingFlow::storeEnergy to UseCases::Managing::Charge::transferEnergy;
  #refine dependency from Functions::Charging::chargingFlow::stopAtTarget to UseCases::Managing::Charge::endSession;
  // SpeedControl.
  #refine dependency from Functions::SpeedControl::speedControlFlow::arbitrateTorque to UseCases::Driving::Accelerate::pressAccelerator;
  #refine dependency from Functions::SpeedControl::speedControlFlow::driveWheels to UseCases::Driving::Accelerate::driveWheels;
  #refine dependency from Functions::SpeedControl::speedControlFlow::arbitrateTorque to UseCases::Driving::Accelerate::limitTorque;
  #refine dependency from Functions::SpeedControl::speedControlFlow::arbitrateTorque to UseCases::Driving::Brake::pressBrake;
  #refine dependency from Functions::SpeedControl::speedControlFlow::blendRegen to UseCases::Driving::Brake::applyBrake;
  #refine dependency from Functions::SpeedControl::speedControlFlow::applyFriction to UseCases::Driving::Brake::applyBrake;
  #refine dependency from Functions::SpeedControl::speedControlFlow::arbitrateTorque to UseCases::Driving::EmergencyStop::pressBrakeHard;
  #refine dependency from Functions::SpeedControl::speedControlFlow::blendRegen to UseCases::Driving::EmergencyStop::brakeAtMaximum;
  #refine dependency from Functions::SpeedControl::speedControlFlow::applyFriction to UseCases::Driving::EmergencyStop::brakeAtMaximum;
  // Maneuvrability.
  #refine dependency from Functions::Maneuvrability::gearSelectionFlow::selectGear to UseCases::Driving::ChangeGear::selectGear;
  #refine dependency from Functions::Maneuvrability::gearSelectionFlow::engageGear to UseCases::Driving::ChangeGear::engageGear;
  #refine dependency from Functions::Maneuvrability::gearSelectionFlow::refuseGear to UseCases::Driving::ChangeGear::refuseGear;
  #refine dependency from Functions::Maneuvrability::maneuvrabilityFlow::steerWheels to UseCases::Driving::TurnLeft::steerWheels;
  #refine dependency from Functions::Maneuvrability::maneuvrabilityFlow::holdRoad to UseCases::Driving::TurnLeft::steerWheels;
  #refine dependency from Functions::Maneuvrability::maneuvrabilityFlow::steerWheels to UseCases::Driving::TurnRight::steerWheels;
  #refine dependency from Functions::Maneuvrability::maneuvrabilityFlow::holdRoad to UseCases::Driving::TurnRight::steerWheels;
  // Lighting.
  #refine dependency from Functions::Lighting::lightingFlow::selectLamps to UseCases::Driving::ToggleHeadlights::turnLightSwitch;
  #refine dependency from Functions::Lighting::lightingFlow::lightLamps to UseCases::Driving::ToggleHeadlights::lightLamps;
  #refine dependency from Functions::Lighting::lightingFlow::switchOffLamps to UseCases::Driving::ToggleHeadlights::switchOffLamps;
  #refine dependency from Functions::Lighting::indicatorFlow::readIndicatorRequest to UseCases::Driving::TurnLeft::flashLeftIndicator;
  #refine dependency from Functions::Lighting::indicatorFlow::flashIndicator to UseCases::Driving::TurnLeft::flashLeftIndicator;
  #refine dependency from Functions::Lighting::indicatorFlow::readIndicatorRequest to UseCases::Driving::TurnRight::flashRightIndicator;
  #refine dependency from Functions::Lighting::indicatorFlow::flashIndicator to UseCases::Driving::TurnRight::flashRightIndicator;
  #refine dependency from Functions::Lighting::brakeLampFlow::readBrakeRequest to UseCases::Driving::Brake::applyBrakeLights;
  #refine dependency from Functions::Lighting::brakeLampFlow::lightBrakeLamps to UseCases::Driving::Brake::applyBrakeLights;
  #refine dependency from Functions::Lighting::indicatorFlow::readIndicatorRequest to UseCases::Driving::EmergencyStop::flashHazards;
  #refine dependency from Functions::Lighting::indicatorFlow::flashHazards to UseCases::Driving::EmergencyStop::flashHazards;
  // WindshieldCleaning.
  #refine dependency from Functions::WindshieldCleaning::windshieldCleaningFlow::readStalk to UseCases::Driving::CleanWindshield::moveStalk;
  #refine dependency from Functions::WindshieldCleaning::windshieldCleaningFlow::sprayWasher to UseCases::Driving::CleanWindshield::sprayWasher;
  #refine dependency from Functions::WindshieldCleaning::windshieldCleaningFlow::sweepGlass to UseCases::Driving::CleanWindshield::sweepGlass;
  #refine dependency from Functions::WindshieldCleaning::windshieldCleaningFlow::parkBlades to UseCases::Driving::CleanWindshield::parkBlades;
  // Climate.
  #refine dependency from Functions::Climate::climateFlow::readSetpoint to UseCases::Managing::AdjustClimate::setTemperature;
  #refine dependency from Functions::Climate::climateFlow::conditionCabin to UseCases::Managing::AdjustClimate::conditionCabin;
  // Entertainment.
  #refine dependency from Functions::Entertainment::entertainmentFlow::selectTitle to UseCases::Managing::PlayMedia::selectTitle;
  #refine dependency from Functions::Entertainment::entertainmentFlow::playMedia to UseCases::Managing::PlayMedia::playTitle;
  #refine dependency from Functions::Entertainment::entertainmentFlow::stopPlayback to UseCases::Managing::PlayMedia::stopPlayback;
  // DriverFeedback.
  #refine dependency from Functions::DriverFeedback::powerModeFlow::showPowerMode to UseCases::Driving::StartVehicle::showReady;
  #refine dependency from Functions::DriverFeedback::powerModeFlow::showPrompt to UseCases::Driving::StartVehicle::rejectKey;
  #refine dependency from Functions::DriverFeedback::powerModeFlow::showPrompt to UseCases::Driving::StartVehicle::askForBrake;
  #refine dependency from Functions::DriverFeedback::powerModeFlow::showPowerMode to UseCases::Driving::StopVehicle::shutDown;
  #refine dependency from Functions::DriverFeedback::powerModeFlow::showPrompt to UseCases::Driving::StopVehicle::askForPark;
  #refine dependency from Functions::DriverFeedback::driverFeedbackFlow::showGear to UseCases::Driving::ChangeGear::engageGear;
  #refine dependency from Functions::DriverFeedback::driverFeedbackFlow::showWarnings to UseCases::Driving::ChangeGear::refuseGear;
  #refine dependency from Functions::DriverFeedback::driverFeedbackFlow::showWarnings to UseCases::Driving::Accelerate::limitTorque;
  #refine dependency from Functions::DriverFeedback::driverFeedbackFlow::showSpeed to UseCases::Driving::Accelerate::showSpeed;
  #refine dependency from Functions::DriverFeedback::driverFeedbackFlow::showBeamSymbol to UseCases::Driving::ToggleHeadlights::showBeamSymbol;
  #refine dependency from Functions::DriverFeedback::cabinStatusFlow::showDoorState to UseCases::Managing::OpenDoor::releaseDoor;
  #refine dependency from Functions::DriverFeedback::cabinStatusFlow::showDoorState to UseCases::Managing::CloseDoor::clearDoorWarning;
  #refine dependency from Functions::DriverFeedback::cabinStatusFlow::showDoorState to UseCases::Managing::CloseDoor::keepDoorWarning;
  #refine dependency from Functions::DriverFeedback::cabinStatusFlow::showSetpoint to UseCases::Managing::AdjustClimate::showSetpoint;
  #refine dependency from Functions::DriverFeedback::chargeStatusFlow::showStateOfCharge to UseCases::Managing::Charge::reportCharge;
  #refine dependency from Functions::DriverFeedback::chargeStatusFlow::showFinalCharge to UseCases::Managing::Charge::endSession;
}
