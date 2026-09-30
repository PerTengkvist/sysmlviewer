package Functions {
  doc /* Functional architecture of the electric car. Each function is a part. A dashed «keyword» dependency points from the function that needs another function to the function it depends on. Security and Charging are roots: driving, comfort and visibility depend on an authenticated vehicle and on energy. */

  part def Security {
    doc /* Authenticate the driver, unlock and lock the doors, and release the immobilizer. Every driving function depends on Security before the car will move. */
  }

  part def Charging {
    doc /* Take energy from a home or fast charger and store it in the battery. Speed control, climate, entertainment, lighting and windshield cleaning draw on this energy. */
  }

  part def SpeedControl {
    doc /* Command traction torque and braking, including regenerative braking, so the driver can set and hold speed. Depends on Security for the immobilizer and on Charging for energy. */
  }

  part def Maneuvrability {
    doc /* Steer the car left and right and keep it directionally stable. Depends on Security, and on SpeedControl because steering response changes with speed. */
  }

  part def Entertainment {
    doc /* Play audio and video for the driver and passengers. Depends on Security so the cabin systems wake only for an authorized user, and on Charging for power. */
  }

  part def Climate {
    doc /* Heat, cool and demist the cabin. Depends on Charging because the compressor and heater are electric. */
  }

  part def WindshieldCleaning {
    doc /* Wipe and wash the windshield so the driver can see. Depends on Charging for the wiper motor and on SpeedControl so the wipe rate can follow vehicle speed. */
  }

  part def Lighting {
    doc /* Headlamps, tail lamps and direction indicators. Depends on Security and Charging. Indicators also depend on Maneuvrability because they follow the intended turn. */
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

  view def FunctionsView : GeneralView {
    doc /* Functional dependency view. Arrows are «Authorize», «Energy», «Stability», «Speed» and «Indicate» dependencies. */
    expose Functions;
  }
}
