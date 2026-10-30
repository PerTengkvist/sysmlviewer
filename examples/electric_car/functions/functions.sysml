package Functions {
  doc /* Functional architecture of the electric car. Each top-level part is a function the car performs for its users; the parts nested inside it are the functional entities the function decomposes into. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. Every functional entity is allocated to exactly one logical part, and a logical part comprises one or more entities. That allocation is how the logical architecture is synthesized from the use cases. */

  part def Security {
    doc /* Authenticate the driver, unlock and lock the doors, and release the immobilizer. Every driving function depends on Security before the car will move. */
    part authenticate {
      doc /* Check the key fob credential before any unlock, lock or start. Allocated to the vehicle controller. */
    }
    part immobilizer {
      doc /* Keep propulsion inhibited until the driver is authenticated and the start button is pressed. Allocated to the vehicle controller. */
    }
    part wakeUp {
      doc /* Bring the cabin systems out of sleep when the car unlocks. Allocated to the vehicle controller. */
    }
    part lockControl {
      doc /* Engage and release the latches and flash the indicators as confirmation. Allocated to the body controller. */
    }
    part driverInformation {
      doc /* Tell the driver what state the car is in: ready, gear, speed, charge and warnings. Allocated to the instrument cluster. */
    }
  }

  part def Charging {
    doc /* Take energy from a home or fast charger and store it in the battery. Speed control, climate, entertainment, lighting and windshield cleaning draw on this energy. */
    part chargeConnection {
      doc /* Detect the plug and carry the charger's energy into the car. Allocated to the charge inlet. */
    }
    part chargeSession {
      doc /* Negotiate current with the charger and stop at the target state of charge. Allocated to the battery. */
    }
    part energyStorage {
      doc /* Store traction energy and publish the discharge limit. Allocated to the battery. */
    }
  }

  part def SpeedControl {
    doc /* Command traction torque and braking, including regenerative braking, so the driver can set and hold speed. Depends on Security for the immobilizer and on Charging for energy. */
    part torqueArbitration {
      doc /* Turn pedal travel into a torque command bounded by the battery limit. Allocated to the drive controller. */
    }
    part regenBlending {
      doc /* Split a deceleration request between regenerative torque and friction pressure. Allocated to the drive controller. */
    }
    part tractionDrive {
      doc /* Convert electrical power into torque at the wheels. Allocated to the engine. */
    }
    part frictionBraking {
      doc /* Apply hydraulic brake pressure, with anti-lock modulation in an emergency stop. Allocated to the friction brakes. */
    }
  }

  part def Maneuvrability {
    doc /* Steer the car left and right, select the direction of travel, and keep it directionally stable. Depends on Security, and on SpeedControl because steering response changes with speed. */
    part steeringControl {
      doc /* Turn the steering wheel angle into a wheel angle. Allocated to the drive controller. */
    }
    part gearSelection {
      doc /* Accept park, reverse, neutral or drive only when it is safe. Allocated to the drive controller. */
    }
    part roadHolding {
      doc /* Keep the tyres on the road over bumps and in corners. Allocated to the suspension. */
    }
  }

  part def Entertainment {
    doc /* Play audio and video for the driver and passengers. Depends on Security so the cabin systems wake only for an authorized user, and on Charging for power. */
    part mediaPlayback {
      doc /* Select and play titles on the cabin display and speakers. Allocated to the entertainment system. */
    }
  }

  part def Climate {
    doc /* Heat, cool and demist the cabin. Depends on Charging because the compressor and heater are electric. */
    part cabinTemperature {
      doc /* Hold the cabin at the set temperature with heater, compressor and fans. Allocated to the climate system. */
    }
  }

  part def WindshieldCleaning {
    doc /* Wipe and wash the windshield so the driver can see. Depends on Charging for the wiper motor and on SpeedControl so the wipe rate can follow vehicle speed. */
    part wipeControl {
      doc /* Turn the stalk position into wipe speed and washer pulses. Allocated to the body controller. */
    }
    part wipeSweep {
      doc /* Sweep the glass and park the blades. Allocated to the wipers. */
    }
  }

  part def Lighting {
    doc /* Headlamps, tail lamps, brake lamps and direction indicators. Depends on Security and Charging. Indicators also depend on Maneuvrability because they follow the intended turn. */
    part headlampControl {
      doc /* Switch low and high beam on and off. Allocated to the body controller. */
    }
    part indicatorControl {
      doc /* Flash direction indicators, brake lamps and hazard lights. Allocated to the body controller. */
    }
    part lampDrive {
      doc /* Light the lamp units. Allocated to the lamps. */
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

  view def FunctionsView : GeneralView {
    doc /* Functional dependency view. Arrows are «Authorize», «Energy», «Stability», «Speed» and «Indicate» dependencies between functions. Allocations are filtered out; see FunctionAllocationView. */
    expose Functions;
    filter @PartUsage or @Dependency;
  }

  view def FunctionAllocationView : GeneralView {
    doc /* Functional entities and the logical parts they are allocated to. One logical part comprises one or more entities. */
    expose Functions;
    expose LogicalArchitecture::Car;
    filter @PartUsage or @AllocationUsage;
  }
}
