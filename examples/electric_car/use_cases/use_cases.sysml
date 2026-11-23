package UseCases {
  doc /* Use cases for the electric car, split into Driving (what the driver does on the road) and Managing (what driver and passengers do with the car when it stands still). Actors are the driver, the passenger and the external charger. Drive includes starting the car and the manoeuvres it is made of. Park includes stopping and locking. EmergencyStop extends Brake. Each use case names the requirement it pursues and the user story it refines, and has an activity flow on the system boundary: what the actor does and how the car answers, with the alternative paths where the car can refuse. */

  part def ElectricCar {
    doc /* The battery-electric passenger car that is the subject of these use cases. */
  }

  subject vehicle : ElectricCar;

  package Driving {
    doc /* Use cases performed from the driver's seat with the car Ready or Driving: start and stop, gear, speed, steering, visibility and parking. */

    use case def <'UC001'> StartVehicle {
      actor Driver { perform pressStart; }
      objective Requirements::PowerModes;
      objective Requirements::Immobilizer;
      doc /* The driver presses the start button with the brake held. The car authenticates the key, releases the immobilizer, closes the high-voltage contactor and shows Ready. Starting is where the immobilizer requirement is met: the car becomes Ready only once the key has been approved. Without the brake held, or without an approved key in the cabin, the car stays Off and tells the driver why. */

      action pressStart {
        doc /* The driver presses the start button. */
      }
      action checkKey {
        doc /* With the brake held: the car looks for an approved key in the cabin. */
      }
      action showReady {
        doc /* The key is approved: the immobilizer is released, high voltage comes on and the cluster shows Ready. */
      }
      action rejectKey {
        doc /* No approved key is found: the car stays Off and the cluster asks for the key. */
      }
      action askForBrake {
        doc /* The brake is not held: the car stays Off and the cluster asks the driver to press the brake. */
      }
      first start;
      then pressStart;
      then if brakeHeld then checkKey else askForBrake;
      first checkKey;
      then if keyApproved then showReady else rejectKey;
      first showReady then done;
      first rejectKey then done;
      first askForBrake then done;
    }

    use case def <'UC002'> StopVehicle {
      actor Driver { perform pressStart; }
      objective Requirements::PowerModes;
      doc /* With the car in Park the driver presses the start button again. The car opens the high-voltage contactor, re-arms the immobilizer and shows Off. In any other gear the car stays Ready and asks for park. */

      action pressStart {
        doc /* The driver presses the start button with the car standing still. */
      }
      action shutDown {
        doc /* Park is selected: high voltage goes off, the immobilizer is armed again and the cluster shows Off. */
      }
      action askForPark {
        doc /* Another gear is selected: the car stays Ready and the cluster asks the driver to select park first. */
      }
      first start;
      then pressStart;
      then if parkSelected then shutDown else askForPark;
      first shutDown then done;
      first askForPark then done;
    }

    use case def <'UC003'> ChangeGear {
      actor Driver;
      objective Requirements::PropulsionModes;
      doc /* The driver selects park, reverse, neutral or drive. The drive controller only accepts the change when it is safe and shows the gear. An unsafe change is refused and the gear stays as it was. */

      action selectGear {
        doc /* The driver moves the gear selector to P, R, N or D. */
      }
      action engageGear {
        doc /* The change is safe: the car engages the selected gear and the cluster shows it. */
      }
      action refuseGear {
        doc /* The change is unsafe, such as reverse while rolling forward or leaving park without the brake: the car keeps the current gear and the cluster says why. */
      }
      first start;
      then selectGear;
      then if changeSafe then engageGear else refuseGear;
      first engageGear then done;
      first refuseGear then done;
    }

    use case def <'UC004'> TurnLeft {
      actor Driver;
      objective Requirements::DirectionalControl;
      doc /* The driver turns the steering wheel left and the car follows. */

      action turnWheelLeft {
        doc /* The driver turns the steering wheel to the left. */
      }
      action steerWheels {
        doc /* The front wheels follow the steering wheel and the car turns left, with lighter steering at low speed. */
      }
      first start;
      then turnWheelLeft;
      then steerWheels;
      then done;
    }

    use case def <'UC005'> TurnRight {
      actor Driver;
      objective Requirements::DirectionalControl;
      doc /* The driver turns the steering wheel right and the car follows. */

      action turnWheelRight {
        doc /* The driver turns the steering wheel to the right. */
      }
      action steerWheels {
        doc /* The front wheels follow the steering wheel and the car turns right, with lighter steering at low speed. */
      }
      first start;
      then turnWheelRight;
      then steerWheels;
      then done;
    }

    use case def <'UC006'> Brake {
      actor Driver;
      objective Requirements::BrakingDistance;
      doc /* The driver presses the brake pedal and the car slows, blending regeneration and friction, with the brake lamps lit. */

      action pressBrake {
        doc /* The driver presses the brake pedal. */
      }
      action applyBrake {
        doc /* The car slows in proportion to pedal travel, recovering energy where it can. */
      }
      action applyBrakeLights {
        doc /* The brake lamps light while the pedal is pressed, so traffic behind sees the car slow down. */
      }
      first start;
      then pressBrake;
      then applyBrake;
      then applyBrakeLights;
      then done;
    }

    use case def <'UC007'> Accelerate {
      actor Driver;
      objective Requirements::Acceleration;
      objective Requirements::TopSpeed;
      doc /* The driver presses the accelerator and the motor delivers torque within the battery's limit. The same use case carries the car up to its top speed, so it pursues both the acceleration and the top-speed requirement. With a cold or nearly empty battery the car delivers less torque and says so. */

      action pressAccelerator {
        doc /* The driver presses the accelerator pedal. */
      }
      action driveWheels {
        doc /* Full power is available: the car accelerates in proportion to pedal travel, up to its top speed. */
      }
      action limitTorque {
        doc /* The battery is cold or nearly empty: the car accelerates with reduced torque and the cluster shows that power is limited. */
      }
      action showSpeed {
        doc /* The cluster shows the speed as it rises. */
      }
      first start;
      then pressAccelerator;
      then if fullPower then driveWheels else limitTorque;
      then showSpeed;
      then done;
    }

    use case def <'UC008'> EmergencyStop {
      actor Driver;
      objective Requirements::BrakingDistance;
      doc /* The driver brakes hard from speed. Extends Brake with maximum deceleration, anti-lock modulation and hazard lights. */

      action pressBrakeHard {
        doc /* From speed the driver stamps on the brake pedal. */
      }
      action brakeAtMaximum {
        doc /* The car brakes as hard as the road allows, keeping the wheels from locking so the driver can still steer. */
      }
      action flashHazards {
        doc /* The hazard lights flash to warn the traffic behind. */
      }
      first start;
      then pressBrakeHard;
      then brakeAtMaximum;
      then flashHazards;
      then done;
    }

    use case def <'UC009'> CleanWindshield {
      actor Driver;
      objective Requirements::ForwardVisibility;
      doc /* The driver starts the wipers and washer and the windshield is cleared. */

      action moveStalk {
        doc /* The driver moves the wiper stalk to intermittent, slow, fast or wash. */
      }
      action sprayWasher {
        doc /* Wash is selected: washer fluid is sprayed on the windshield. */
      }
      action sweepGlass {
        doc /* The wipers sweep the glass at the selected speed. */
      }
      action parkBlades {
        doc /* The driver returns the stalk to off: the blades finish their sweep and stop below the windshield. */
      }
      first start;
      then moveStalk;
      then if washSelected then sprayWasher else sweepGlass;
      first sprayWasher then sweepGlass;
      then parkBlades;
      then done;
    }

    use case def <'UC010'> ToggleHeadlights {
      actor Driver;
      objective Requirements::NightVisibility;
      doc /* The driver switches the headlamps on or off, or between low and high beam. */

      action turnLightSwitch {
        doc /* The driver turns the light switch or pulls the high-beam stalk. */
      }
      action lightLamps {
        doc /* The low or high beams the driver chose light up. */
      }
      action switchOffLamps {
        doc /* The driver switched the lights off: the headlamps go dark. */
      }
      action showBeamSymbol {
        doc /* The cluster shows the symbol of the beam that is lit, or none. */
      }
      first start;
      then turnLightSwitch;
      then if lampsOn then lightLamps else switchOffLamps;
      then showBeamSymbol;
      then done;
    }

    use case def <'UC011'> Drive {
      actor Driver;
      actor Passenger;
      objective Requirements::Range;
      include use case StartVehicle;
      include use case ChangeGear;
      include use case Accelerate;
      include use case Brake;
      include use case TurnLeft;
      include use case TurnRight;
      doc /* The driver takes the car from origin to destination. Includes starting, gear selection, speed control and steering. The passenger rides along. Speed control and steering repeat until the car has arrived. */

      action arrive {
        doc /* The car has reached the destination; the driver goes on to Park. */
      }
      first start;
      then perform StartVehicle;
      then perform ChangeGear;
      then perform Accelerate;
      then perform TurnLeft;
      then perform TurnRight;
      then perform Brake;
      // Loop: accelerate, steer and brake again until the destination is reached.
      then if arrived then arrive else Accelerate;
      first arrive then done;
    }

    use case def <'UC012'> Park {
      actor Driver;
      objective Requirements::LockIndication;
      include use case StopVehicle;
      include use case UseCases::Managing::Lock;
      doc /* The driver stops, selects park, shuts the car down and locks it. Includes StopVehicle and Lock. */

      action stopCar {
        doc /* The driver brakes the car to a standstill. */
      }
      action selectPark {
        doc /* The driver selects park and the cluster shows P. */
      }
      first start;
      then stopCar;
      then selectPark;
      then perform StopVehicle;
      then perform UseCases::Managing::Lock;
      then done;
    }

    #extend dependency from EmergencyStop to Brake;

    #refine dependency from StartVehicle to Requirements::DriveToDestination;
    #refine dependency from StopVehicle to Requirements::ParkAndLeave;
    #refine dependency from ChangeGear to Requirements::DriveToDestination;
    #refine dependency from Accelerate to Requirements::ControlSpeed;
    #refine dependency from Brake to Requirements::ControlSpeed;
    #refine dependency from EmergencyStop to Requirements::ControlSpeed;
    #refine dependency from TurnLeft to Requirements::FollowTheRoad;
    #refine dependency from TurnRight to Requirements::FollowTheRoad;
    #refine dependency from CleanWindshield to Requirements::FollowTheRoad;
    #refine dependency from ToggleHeadlights to Requirements::DriveAtNight;
    #refine dependency from Drive to Requirements::DriveToDestination;
    #refine dependency from Park to Requirements::ParkAndLeave;
  }

  package Managing {
    doc /* Use cases performed with the car standing still: access, doors and windows, cabin comfort, media and charging. Driver and passenger share most of them. */

    use case def <'UC013'> Unlock {
      actor Driver { perform pressUnlock; }
      actor Passenger { perform pressUnlock; }
      objective Requirements::AccessControl;
      doc /* The driver presses unlock on the key fob. The car authenticates the credential, releases the latches, flashes the indicators and wakes the cabin. A key the car does not recognise is rejected and the car stays locked. */

      action pressUnlock {
        doc /* The driver presses unlock on the key fob. */
      }
      action unlockDoors {
        doc /* The key is recognised: the latches release and the indicators flash once. */
      }
      action wakeCabin {
        doc /* The cabin wakes, so the display and controls respond when the driver gets in. */
      }
      action rejectKey {
        doc /* The key is not recognised: the doors stay locked and the indicators do not flash. */
      }
      first start;
      then pressUnlock;
      then if credentialValid then unlockDoors else rejectKey;
      first unlockDoors then wakeCabin;
      first wakeCabin then done;
      first rejectKey then done;
    }

    use case def <'UC014'> Lock {
      actor Driver { perform pressLock; }
      actor Passenger { perform pressLock; }
      objective Requirements::LockIndication;
      doc /* The driver presses lock on the key fob. The car checks that all doors are closed, engages the latches and flashes the indicators as confirmation. With a door open the car stays unlocked and gives no confirmation. */

      action pressLock {
        doc /* The driver presses lock on the key fob. */
      }
      action lockDoors {
        doc /* Every door is closed: the latches engage and the indicators flash as confirmation. */
      }
      action stayUnlocked {
        doc /* A door is still open: the car stays unlocked and the indicators do not flash, so the driver sees it is not locked. */
      }
      first start;
      then pressLock;
      then if doorsClosed then lockDoors else stayUnlocked;
      first lockDoors then done;
      first stayUnlocked then done;
    }

    use case def <'UC015'> OpenDoor {
      actor Driver { perform pullHandle; }
      actor Passenger { perform pullHandle; }
      objective Requirements::CabinAccess;
      doc /* An occupant pulls a door handle and the door releases. The inside handle always opens the door, so nobody can be shut in; the outside handle opens it only on an unlocked car. */

      action pullHandle {
        doc /* An occupant pulls the inside or the outside handle of a door. */
      }
      action releaseDoor {
        doc /* The latch lets go, the door opens and the cluster shows the door-ajar warning. */
      }
      action stayLatched {
        doc /* Outside handle on a locked car: the door stays shut. */
      }
      first start;
      then pullHandle;
      then if insideOrUnlocked then releaseDoor else stayLatched;
      first releaseDoor then done;
      first stayLatched then done;
    }

    use case def <'UC016'> CloseDoor {
      actor Driver { perform pushDoorShut; }
      actor Passenger { perform pushDoorShut; }
      objective Requirements::CabinAccess;
      doc /* An occupant closes a door; the latch engages and the door-ajar warning clears. A door that is not pushed fully shut keeps the warning on. */

      action pushDoorShut {
        doc /* An occupant swings the door shut. */
      }
      action clearDoorWarning {
        doc /* The latch catches and the door-ajar warning clears. */
      }
      action keepDoorWarning {
        doc /* The door did not close fully: the latch does not catch and the warning stays on until the door is shut again. */
      }
      first start;
      then pushDoorShut;
      then if doorLatched then clearDoorWarning else keepDoorWarning;
      first clearDoorWarning then done;
      first keepDoorWarning then done;
    }

    use case def <'UC017'> OpenWindow {
      actor Driver { perform holdSwitchDown; }
      actor Passenger { perform holdSwitchDown; }
      objective Requirements::CabinAccess;
      doc /* An occupant presses the window switch down and the window lowers. */

      action holdSwitchDown {
        doc /* An occupant holds the window switch down. */
      }
      action lowerWindow {
        doc /* The window lowers until the switch is released or the window is fully open. */
      }
      first start;
      then holdSwitchDown;
      then lowerWindow;
      then done;
    }

    use case def <'UC018'> CloseWindow {
      actor Driver { perform holdSwitchUp; }
      actor Passenger { perform holdSwitchUp; }
      objective Requirements::CabinAccess;
      doc /* An occupant presses the window switch up and the window rises, backing off if something is caught in the gap. */

      action holdSwitchUp {
        doc /* An occupant holds the window switch up. */
      }
      action raiseWindow {
        doc /* The window rises while the switch is held. */
      }
      action stopWindow {
        doc /* The switch is released or the window is closed: the window stops. */
      }
      action reverseWindow {
        doc /* Something is caught in the gap: the window backs off so it is not pinched. */
      }
      first start;
      then holdSwitchUp;
      then raiseWindow;
      then if pinchDetected then reverseWindow else stopWindow;
      then done;
    }

    use case def <'UC019'> AdjustClimate {
      actor Driver { perform setTemperature; }
      actor Passenger { perform setTemperature; }
      objective Requirements::CabinClimate;
      doc /* The driver or a passenger sets cabin temperature and airflow. */

      action setTemperature {
        doc /* The driver or a passenger sets the temperature and fan level on the climate controls. */
      }
      action showSetpoint {
        doc /* The display shows the new set temperature. */
      }
      action conditionCabin {
        doc /* The car heats or cools the cabin until it reaches the set temperature, and clears the glass if it fogs. */
      }
      first start;
      then setTemperature;
      then showSetpoint;
      then conditionCabin;
      then done;
    }

    use case def <'UC020'> PlayMedia {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinMedia;
      doc /* The driver or a passenger plays audio or video on the cabin system. */

      action selectTitle {
        doc /* The driver or a passenger picks a title on the cabin display. */
      }
      action playTitle {
        doc /* The title plays on the display and speakers, and the display shows what is playing. */
      }
      action stopPlayback {
        doc /* The title ends or the occupant stops it, and the cabin falls quiet. */
      }
      first start;
      then selectTitle;
      then playTitle;
      // Loop: pick another title while playing.
      then if anotherTitle then selectTitle else stopPlayback;
      first stopPlayback then done;
    }

    use case def <'UC021'> Charge {
      actor Driver;
      actor Charger;
      objective Requirements::ChargeTime;
      doc /* The driver connects a home or fast charger. The car and the charger negotiate a session, the battery takes energy and the state of charge is reported until the driver unplugs. */

      action connectCharger {
        doc /* The driver plugs a home or fast charger into the charge inlet and the car locks the plug. */
      }
      action negotiateSession {
        doc /* The car and the charger agree on the current the battery can take. */
      }
      action transferEnergy {
        doc /* Energy flows from the charger into the battery. */
      }
      action reportCharge {
        doc /* The cluster shows the state of charge and the time left. */
      }
      action endSession {
        doc /* The driver ends the session: the charger stops, the plug is released and the cluster shows the final state of charge. */
      }
      first start;
      then connectCharger;
      then negotiateSession;
      then transferEnergy;
      then reportCharge;
      // Loop: keep charging while the charger stays plugged in.
      then if pluggedIn then transferEnergy else endSession;
      first endSession then done;
    }

    #refine dependency from Unlock to Requirements::ParkAndLeave;
    #refine dependency from Lock to Requirements::ParkAndLeave;
    #refine dependency from OpenDoor to Requirements::EnterAndExit;
    #refine dependency from CloseDoor to Requirements::EnterAndExit;
    #refine dependency from OpenWindow to Requirements::EnterAndExit;
    #refine dependency from CloseWindow to Requirements::EnterAndExit;
    #refine dependency from AdjustClimate to Requirements::EnjoyTheCabin;
    #refine dependency from PlayMedia to Requirements::EnjoyTheCabin;
    #refine dependency from Charge to Requirements::ChargeAtHome, Requirements::ChargeAway;
  }

  view VehicleUseCaseView : UseCaseView {
    doc /* Use-case diagram. Driver, passenger and charger are associated with the cases they take part in. «include» and «extend» relate the cases. Driving cases on one side, Managing cases on the other. */
    expose UseCases;
  }

  view UseCaseTraceabilityView : UseCaseView {
    doc /* Requirement traceability of the driving use cases. Each case points with «objective» to the requirement it must fulfil (right) and with «refine» to the user story it refines (left). One expose names the driving use cases; one expose per requirement (in another file) adds exactly the requirements they trace to. The filter keeps use cases, requirements and dependencies, so actors and «include» are left out. */
    expose Driving;
    expose Requirements::PowerModes;
    expose Requirements::Immobilizer;
    expose Requirements::DriveToDestination;
    expose Requirements::PropulsionModes;
    expose Requirements::Range;
    expose Requirements::Acceleration;
    expose Requirements::TopSpeed;
    expose Requirements::ControlSpeed;
    expose Requirements::BrakingDistance;
    expose Requirements::ParkAndLeave;
    expose Requirements::DirectionalControl;
    expose Requirements::FollowTheRoad;
    expose Requirements::ForwardVisibility;
    expose Requirements::DriveAtNight;
    expose Requirements::NightVisibility;
    expose Requirements::LockIndication;
    filter @UseCaseUsage or @RequirementUsage or @Dependency;
  }
}
