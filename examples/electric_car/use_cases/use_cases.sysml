package UseCases {
  doc /* Use cases for driving, charging and parking an electric car. Actors are the driver and the passenger. Drive includes the manoeuvres it is made of. Park includes Lock. EmergencyStop extends Brake. Each use case names the requirement it pursues. */

  part def ElectricCar {
    doc /* The battery-electric passenger car that is the subject of these use cases. */
  }

  subject vehicle : ElectricCar;

  use case def Unlock {
    actor Driver;
    actor Passenger;
    objective Requirements::AccessControl;
    doc /* The driver authenticates and the doors unlock. */
  }

  use case def Lock {
    actor Driver;
    actor Passenger;
    objective Requirements::LockIndication;
    doc /* The driver locks the car and receives confirmation. */
  }

  use case def ChangeGear {
    actor Driver;
    objective Requirements::PropulsionModes;
    doc /* The driver selects park, reverse, neutral or drive. */
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
    doc /* The driver presses the brake pedal and the car slows, using the friction brakes and the motor. */
  }

  use case def Accelerate {
    actor Driver;
    objective Requirements::Acceleration;
    doc /* The driver presses the accelerator and the motor delivers torque. */
  }

  use case def EmergencyStop {
    actor Driver;
    objective Requirements::BrakingDistance;
    doc /* The driver brakes hard from speed. Extends Brake with maximum deceleration. */
  }

  use case def Charge {
    actor Driver;
    actor Passenger;
    objective Requirements::ChargeTime;
    doc /* The driver connects a charger at home or at a fast charger and the battery takes energy. */
  }

  use case def AdjustClimate {
    actor Driver;
    actor Passenger;
    doc /* The driver or a passenger sets cabin temperature and airflow. */
  }

  use case def PlayMedia {
    actor Driver;
    actor Passenger;
    doc /* The driver or a passenger plays audio or video on the cabin system. */
  }

  use case def CleanWindshield {
    actor Driver;
    objective Requirements::ForwardVisibility;
    doc /* The driver starts the wipers and the windshield is cleared. */
  }

  use case def Drive {
    actor Driver;
    objective Requirements::Range;
    include use case ChangeGear;
    include use case Accelerate;
    include use case Brake;
    include use case TurnLeft;
    include use case TurnRight;
    doc /* The driver takes the car from origin to destination. Includes gear selection, speed control and steering. The passenger rides along. */
  }

  use case def Park {
    actor Driver;
    objective Requirements::LockIndication;
    include use case Lock;
    doc /* The driver stops, selects park and locks the car. Includes Lock. */
  }

  #extend dependency from EmergencyStop to Brake;

  view def VehicleUseCaseView : UseCaseView {
    doc /* Use-case diagram. Driver and passenger are associated with the cases they take part in. «include» and «extend» relate the cases. */
    expose UseCases;
  }
}
