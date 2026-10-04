package Requirements {
  doc /* Stakeholder requirements and user stories for a compact battery-electric passenger car. Size, performance, safety and security are the requirement groups. Driving, charging and parking are told as user stories. Leaf requirements refine a group. Logical parts satisfy the leaves. */

  requirement def <'REQ-SIZE'> Size {
    attribute Type = "Size";
    doc /* The car shall fit a compact passenger-car envelope and carry people and luggage. */
  }

  requirement def <'REQ-SIZE-01'> VehicleLength {
    doc /* The vehicle shall be at most 4.5 m long. */
  }

  requirement def <'REQ-SIZE-02'> VehicleWidth {
    doc /* The vehicle shall be at most 1.85 m wide, excluding mirrors. */
  }

  requirement def <'REQ-SIZE-03'> VehicleHeight {
    doc /* The vehicle shall be at most 1.6 m high. */
  }

  requirement def <'REQ-SIZE-04'> PassengerCapacity {
    doc /* The vehicle shall seat at least four occupants. */
  }

  requirement def <'REQ-SIZE-05'> CargoVolume {
    doc /* The vehicle shall provide at least 300 litres of cargo volume behind the rear seats. */
  }

  requirement def <'REQ-PERF'> Performance {
    attribute Type = "Performance";
    doc /* The car shall deliver everyday range, acceleration, speed and charging. */
  }

  requirement def <'REQ-PERF-01'> Range {
    doc /* The vehicle shall travel at least 350 km on a full charge in the WLTP cycle. */
  }

  requirement def <'REQ-PERF-02'> Acceleration {
    doc /* The vehicle shall accelerate from 0 to 100 km/h in at most 8 seconds. */
  }

  requirement def <'REQ-PERF-03'> TopSpeed {
    doc /* The vehicle shall be capable of at least 160 km/h. */
  }

  requirement def <'REQ-PERF-04'> ChargeTime {
    doc /* The battery shall charge from 10 percent to 80 percent in at most 30 minutes on DC fast charge. */
  }

  requirement def <'REQ-PERF-05'> PropulsionModes {
    doc /* The driver shall be able to select park, reverse, neutral and drive. */
  }

  requirement def <'REQ-SAFE'> Safety {
    attribute Type = "Safety";
    doc /* The car shall protect occupants and people outside the vehicle. */
  }

  requirement def <'REQ-SAFE-01'> CrashProtection {
    doc /* The occupant cell shall remain intact in the applicable frontal and side impact tests. */
  }

  requirement def <'REQ-SAFE-02'> BrakingDistance {
    doc /* The vehicle shall stop from 100 km/h within 40 m on dry pavement. */
  }

  requirement def <'REQ-SAFE-03'> PedestrianProtection {
    doc /* The front structure shall reduce pedestrian leg and head injury in a frontal impact. */
  }

  requirement def <'REQ-SAFE-04'> OccupantRestraint {
    doc /* Every seating position shall have a seat belt and be covered by an airbag. */
  }

  requirement def <'REQ-SAFE-05'> DirectionalControl {
    doc /* The vehicle shall follow the steering angle commanded by the driver. */
  }

  requirement def <'REQ-SAFE-06'> ForwardVisibility {
    doc /* The driver shall be able to clear the windshield while driving. */
  }

  requirement def <'REQ-SEC'> Security {
    attribute Type = "Security";
    doc /* The car shall unlock, lock and immobilize only for an authenticated driver. */
  }

  requirement def <'REQ-SEC-01'> AccessControl {
    doc /* Doors shall unlock only after the driver credential has been authenticated. */
  }

  requirement def <'REQ-SEC-02'> Immobilizer {
    doc /* Propulsion shall stay inhibited until the driver has been authenticated. */
  }

  requirement def <'REQ-SEC-03'> LockIndication {
    doc /* The driver shall receive a confirmation when the vehicle is locked. */
  }

  requirement def <'US-DRIVE-01'> DriveToDestination {
    attribute Type = "UserStory";
    doc /* As a driver I want to drive from origin to destination so that I can travel on battery power alone. */
  }

  requirement def <'US-DRIVE-02'> ControlSpeed {
    attribute Type = "UserStory";
    doc /* As a driver I want to accelerate and brake smoothly so that I stay comfortable in traffic. */
  }

  requirement def <'US-DRIVE-03'> FollowTheRoad {
    attribute Type = "UserStory";
    doc /* As a driver I want to turn left and right so that I can follow the road. */
  }

  requirement def <'US-CHG-01'> ChargeAtHome {
    attribute Type = "UserStory";
    doc /* As a driver I want to charge overnight at home so that the car is ready in the morning. */
  }

  requirement def <'US-CHG-02'> ChargeAway {
    attribute Type = "UserStory";
    doc /* As a driver I want to fast-charge during a trip so that I can continue when the battery is low. */
  }

  requirement def <'US-PARK-01'> ParkAndLeave {
    attribute Type = "UserStory";
    doc /* As a driver I want to park, select park and lock the car so that it stays where I left it. */
  }

  requirement def <'US-DRIVE-04'> EnjoyTheCabin {
    attribute Type = "UserStory";
    doc /* As a passenger I want climate and entertainment during the trip so that the journey stays comfortable. */
  }

  #refine dependency from VehicleLength to Size;
  #refine dependency from VehicleWidth to Size;
  #refine dependency from VehicleHeight to Size;
  #refine dependency from PassengerCapacity to Size;
  #refine dependency from CargoVolume to Size;

  #refine dependency from Range to Performance;
  #refine dependency from Acceleration to Performance;
  #refine dependency from TopSpeed to Performance;
  #refine dependency from ChargeTime to Performance;
  #refine dependency from PropulsionModes to Performance;

  #refine dependency from CrashProtection to Safety;
  #refine dependency from BrakingDistance to Safety;
  #refine dependency from PedestrianProtection to Safety;
  #refine dependency from OccupantRestraint to Safety;
  #refine dependency from DirectionalControl to Safety;
  #refine dependency from ForwardVisibility to Safety;

  #refine dependency from AccessControl to Security;
  #refine dependency from Immobilizer to Security;
  #refine dependency from LockIndication to Security;

  #refine dependency from DriveToDestination to Performance;
  #refine dependency from ControlSpeed to Acceleration, BrakingDistance;
  #refine dependency from FollowTheRoad to DirectionalControl;
  #refine dependency from ChargeAtHome to Range, ChargeTime;
  #refine dependency from ChargeAway to ChargeTime;
  #refine dependency from ParkAndLeave to LockIndication, Immobilizer;

  satisfy VehicleLength by LogicalArchitecture::Car::body::bodyShell;
  satisfy VehicleWidth by LogicalArchitecture::Car::body::bodyShell;
  satisfy VehicleHeight by LogicalArchitecture::Car::body::bodyShell;
  satisfy PassengerCapacity by LogicalArchitecture::Car::body::bodyShell;
  satisfy CargoVolume by LogicalArchitecture::Car::body::bodyShell;
  satisfy Range by LogicalArchitecture::Car::skateboard::battery;
  satisfy Acceleration by LogicalArchitecture::Car::skateboard::engine;
  satisfy TopSpeed by LogicalArchitecture::Car::skateboard::engine;
  satisfy ChargeTime by LogicalArchitecture::Car::skateboard::battery;
  satisfy ChargeTime by LogicalArchitecture::Car::skateboard::chargeInlet;
  satisfy PropulsionModes by LogicalArchitecture::Car::driverControls::gearStick;
  satisfy CrashProtection by LogicalArchitecture::Car::body::bodyShell;
  satisfy PedestrianProtection by LogicalArchitecture::Car::body::bodyShell;
  satisfy OccupantRestraint by LogicalArchitecture::Car::body::bodyShell;
  satisfy BrakingDistance by LogicalArchitecture::Car::driverControls::brakePedal;
  satisfy BrakingDistance by LogicalArchitecture::Car::skateboard::wheels;
  satisfy DirectionalControl by LogicalArchitecture::Car::driverControls::steeringWheel;
  satisfy ForwardVisibility by LogicalArchitecture::Car::body::windshield;
  satisfy ForwardVisibility by LogicalArchitecture::Car::body::wipers;
  satisfy AccessControl by LogicalArchitecture::Car::body::door;
  satisfy Immobilizer by LogicalArchitecture::Car::body::door;
  satisfy LockIndication by LogicalArchitecture::Car::body::door;

  view def RequirementsGraphView : GeneralView {
    doc /* Requirement graph. Group requirements, leaf requirements and user stories, with «refine» dependencies. */
    expose Requirements;
  }

  view def RequirementsTableView : GridView {
    doc /* Requirement table. Flat list or hierarchy following «refine» links. User stories carry Type UserStory. */
    expose Requirements;
  }
}
