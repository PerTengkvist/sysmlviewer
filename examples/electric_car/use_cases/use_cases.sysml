package UseCases {
  doc /* Use cases for the electric car, split into Driving (what the driver does on the road) and Managing (what driver and passengers do with the car when it stands still). Actors are the driver, the passenger and the external charger. Drive includes starting the car and the manoeuvres it is made of. Park includes stopping and locking. EmergencyStop extends Brake. Each use case names the requirement it pursues and the user story it refines. */

  part def ElectricCar {
    doc /* The battery-electric passenger car that is the subject of these use cases. */
  }

  subject vehicle : ElectricCar;

  package Driving {
    doc /* Use cases performed from the driver's seat with the car Ready or Driving: start and stop, gear, speed, steering, visibility and parking. */

    use case def StartVehicle {
      actor Driver;
      objective Requirements::PowerModes;
      doc /* The driver presses the start button with the brake held. The car authenticates the key, releases the immobilizer, closes the high-voltage contactor and shows Ready. */
    }

    use case def StopVehicle {
      actor Driver;
      objective Requirements::PowerModes;
      doc /* With the car in Park the driver presses the start button again. The car opens the high-voltage contactor, re-arms the immobilizer and shows Off. */
    }

    use case def ChangeGear {
      actor Driver;
      objective Requirements::PropulsionModes;
      doc /* The driver selects park, reverse, neutral or drive. The drive controller only accepts the change when it is safe and shows the gear. */
    }

    use case def TurnLeft {
      actor Driver;
      objective Requirements::DirectionalControl;
      doc /* The driver turns the steering wheel left and the car follows. */
    }

    use case def TurnRight {
      actor Driver;
      objective Requirements::DirectionalControl;
      doc /* The driver turns the steering wheel right and the car follows. */
    }

    use case def Brake {
      actor Driver;
      objective Requirements::BrakingDistance;
      doc /* The driver presses the brake pedal and the car slows, blending regeneration and friction, with the brake lamps lit. */
    }

    use case def Accelerate {
      actor Driver;
      objective Requirements::Acceleration;
      doc /* The driver presses the accelerator and the motor delivers torque within the battery's limit. */
    }

    use case def EmergencyStop {
      actor Driver;
      objective Requirements::BrakingDistance;
      doc /* The driver brakes hard from speed. Extends Brake with maximum deceleration, anti-lock modulation and hazard lights. */
    }

    use case def CleanWindshield {
      actor Driver;
      objective Requirements::ForwardVisibility;
      doc /* The driver starts the wipers and washer and the windshield is cleared. */
    }

    use case def ToggleHeadlights {
      actor Driver;
      objective Requirements::NightVisibility;
      doc /* The driver switches the headlamps on or off, or between low and high beam. */
    }

    use case def Drive {
      actor Driver;
      actor Passenger;
      objective Requirements::Range;
      include use case StartVehicle;
      include use case ChangeGear;
      include use case Accelerate;
      include use case Brake;
      include use case TurnLeft;
      include use case TurnRight;
      doc /* The driver takes the car from origin to destination. Includes starting, gear selection, speed control and steering. The passenger rides along. */
    }

    use case def Park {
      actor Driver;
      objective Requirements::LockIndication;
      include use case StopVehicle;
      include use case UseCases::Managing::Lock;
      doc /* The driver stops, selects park, shuts the car down and locks it. Includes StopVehicle and Lock. */
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

    use case def Unlock {
      actor Driver;
      actor Passenger;
      objective Requirements::AccessControl;
      doc /* The driver presses unlock on the key fob. The car authenticates the credential, releases the latches, flashes the indicators and wakes the cabin. */
    }

    use case def Lock {
      actor Driver;
      actor Passenger;
      objective Requirements::LockIndication;
      doc /* The driver presses lock on the key fob. The car checks that all doors are closed, engages the latches and flashes the indicators as confirmation. */
    }

    use case def OpenDoor {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinAccess;
      doc /* An occupant pulls a door handle on an unlocked car and the door releases. */
    }

    use case def CloseDoor {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinAccess;
      doc /* An occupant closes a door; the latch engages and the door-ajar warning clears. */
    }

    use case def OpenWindow {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinAccess;
      doc /* An occupant presses the window switch down and the window lowers. */
    }

    use case def CloseWindow {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinAccess;
      doc /* An occupant presses the window switch up and the window rises, stopping if it pinches. */
    }

    use case def AdjustClimate {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinClimate;
      doc /* The driver or a passenger sets cabin temperature and airflow. */
    }

    use case def PlayMedia {
      actor Driver;
      actor Passenger;
      objective Requirements::CabinMedia;
      doc /* The driver or a passenger plays audio or video on the cabin system. */
    }

    use case def Charge {
      actor Driver;
      actor Charger;
      objective Requirements::ChargeTime;
      doc /* The driver connects a home or fast charger. The car and the charger negotiate a session, the battery takes energy and the state of charge is reported until the driver unplugs. */
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

  view def VehicleUseCaseView : UseCaseView {
    doc /* Use-case diagram. Driver, passenger and charger are associated with the cases they take part in. «include» and «extend» relate the cases. Driving cases on one side, Managing cases on the other. */
    expose UseCases;
  }
}
