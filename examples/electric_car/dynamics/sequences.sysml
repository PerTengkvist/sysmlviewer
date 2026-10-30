package Dynamics {
  doc /* Dynamics of the electric car. VehicleModes is the state machine every scenario moves through. Each interaction is one use case drawn as a sequence: an actor asks, a controller decides, actuators act, and the driver gets an acknowledgement (dashed «reply» message). Lifelines carry the names of the logical parts, so the sequences and the logical architecture read as one model. Each interaction states the mode it starts in and the mode it ends in. */

  state def VehicleModes {
    doc /* Modes of the car. Locked is the resting state. Unlocked lets occupants in. Ready means the immobilizer is released and high voltage is on. Driving means a gear other than park is selected. Parked is Ready with park selected. Charging is Unlocked with a charger connected. */
    state Locked;
    state Unlocked;
    state Ready;
    state Driving;
    state Parked;
    state Charging;
    transition unlock from Locked to Unlocked;
    transition lock from Unlocked to Locked;
    transition startVehicle from Unlocked to Ready;
    transition changeGear from Ready to Driving;
    transition park from Driving to Parked;
    transition stopVehicle from Parked to Unlocked;
    transition charge from Unlocked to Charging;
    transition endCharge from Charging to Unlocked;
  }

  // ---------------------------------------------------------------- Managing

  interaction def UnlockSequence {
    doc /* Precondition Locked. Postcondition Unlocked. The driver presses unlock on the key fob. The vehicle controller authenticates the credential, the body controller releases the latches and flashes the indicators, and the cabin wakes. The immobilizer stays armed. */
    lifeline Driver;
    lifeline keyFob;
    lifeline vehicleController;
    lifeline bodyController;
    lifeline locks;
    lifeline lamps;
    lifeline climateSystem;
    message pressUnlock from Driver to keyFob;
    then message credential from keyFob to vehicleController;
    then message authenticated from vehicleController to bodyController;
    then message releaseLatches from bodyController to locks;
    then #reply message latchesReleased from locks to bodyController;
    then message flashIndicators from bodyController to lamps;
    then message wakeCabin from vehicleController to climateSystem;
    then #reply message indicateUnlocked from lamps to Driver;
  }

  interaction def UnlockDeniedSequence {
    doc /* Precondition Locked. Postcondition Locked. Alternative to Unlock: the credential does not match. The vehicle controller refuses, the latches stay engaged and the driver sees no indicator flash. */
    lifeline Driver;
    lifeline keyFob;
    lifeline vehicleController;
    lifeline bodyController;
    lifeline locks;
    message pressUnlock from Driver to keyFob;
    then message credential from keyFob to vehicleController;
    then message credentialRejected from vehicleController to bodyController;
    then message keepLatches from bodyController to locks;
    then #reply message latchesHeld from locks to bodyController;
    then #reply message noResponse from keyFob to Driver;
  }

  interaction def LockSequence {
    doc /* Precondition Unlocked. Postcondition Locked. The driver presses lock on the key fob. The vehicle controller authenticates, the body controller checks that every door is closed, engages the latches and flashes the indicators as confirmation. */
    lifeline Driver;
    lifeline keyFob;
    lifeline vehicleController;
    lifeline bodyController;
    lifeline doors;
    lifeline locks;
    lifeline lamps;
    message pressLock from Driver to keyFob;
    then message credential from keyFob to vehicleController;
    then message authenticated from vehicleController to bodyController;
    then message queryDoorsClosed from bodyController to doors;
    then #reply message allDoorsClosed from doors to bodyController;
    then message engageLatches from bodyController to locks;
    then #reply message latchesEngaged from locks to bodyController;
    then message flashIndicators from bodyController to lamps;
    then #reply message indicateLocked from lamps to Driver;
  }

  interaction def OpenDoorSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant pulls the handle. The body controller confirms the car is unlocked, releases that door's latch and raises the door-ajar warning on the cluster. */
    lifeline Passenger;
    lifeline doors;
    lifeline bodyController;
    lifeline locks;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message pullHandle from Passenger to doors;
    then message handleRequest from doors to bodyController;
    then message releaseLatch from bodyController to locks;
    then #reply message latchReleased from locks to bodyController;
    then message doorAjar from bodyController to vehicleController;
    then message showDoorAjar from vehicleController to instrumentCluster;
    then #reply message doorSwingsOpen from doors to Passenger;
  }

  interaction def CloseDoorSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant pushes the door shut. The latch engages, the body controller clears the door-ajar warning and the cluster stops showing it. */
    lifeline Passenger;
    lifeline doors;
    lifeline locks;
    lifeline bodyController;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message pushDoorShut from Passenger to doors;
    then message latchEngage from doors to locks;
    then #reply message latchEngaged from locks to bodyController;
    then message doorClosed from bodyController to vehicleController;
    then message clearDoorAjar from vehicleController to instrumentCluster;
    then #reply message doorSeated from doors to Passenger;
  }

  interaction def OpenWindowSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant holds the window switch down. The body controller drives the lift motor from battery power until the switch is released or the window is fully open. */
    lifeline Passenger;
    lifeline windowLifts;
    lifeline bodyController;
    lifeline battery;
    lifeline windows;
    message pressSwitchDown from Passenger to windowLifts;
    then message lowerRequest from windowLifts to bodyController;
    then message lowerWindow from bodyController to windowLifts;
    then message drawPower from windowLifts to battery;
    then message moveGlassDown from windowLifts to windows;
    then #reply message fullyOpen from windows to bodyController;
    then #reply message windowOpen from windowLifts to Passenger;
  }

  interaction def CloseWindowSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant holds the window switch up. The body controller raises the window and watches the motor current; a pinch reverses the glass before it closes. */
    lifeline Passenger;
    lifeline windowLifts;
    lifeline bodyController;
    lifeline battery;
    lifeline windows;
    message pressSwitchUp from Passenger to windowLifts;
    then message raiseRequest from windowLifts to bodyController;
    then message raiseWindow from bodyController to windowLifts;
    then message drawPower from windowLifts to battery;
    then message moveGlassUp from windowLifts to windows;
    then message pinchCheck from windowLifts to bodyController;
    then #reply message fullyClosed from windows to bodyController;
    then #reply message windowClosed from windowLifts to Passenger;
  }

  interaction def AdjustClimateSequence {
    doc /* Precondition Ready. Postcondition Ready. The driver sets a temperature. The climate system asks the battery for power, drives heater, compressor and fans, and the cluster shows the set point. */
    lifeline Driver;
    lifeline climateSystem;
    lifeline battery;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message setTemperature from Driver to climateSystem;
    then message requestPower from climateSystem to battery;
    then #reply message powerGranted from battery to climateSystem;
    then message setPointChanged from climateSystem to vehicleController;
    then message showSetPoint from vehicleController to instrumentCluster;
    then #reply message airFlows from climateSystem to Driver;
  }

  interaction def PlayMediaSequence {
    doc /* Precondition Ready. Postcondition Ready. A passenger selects a title. The entertainment system checks the cabin is awake, draws power, starts playback and shows now playing. */
    lifeline Passenger;
    lifeline entertainmentSystem;
    lifeline vehicleController;
    lifeline battery;
    lifeline instrumentCluster;
    message selectTitle from Passenger to entertainmentSystem;
    then message queryCabinAwake from entertainmentSystem to vehicleController;
    then #reply message cabinAwake from vehicleController to entertainmentSystem;
    then message requestPower from entertainmentSystem to battery;
    then message nowPlaying from entertainmentSystem to instrumentCluster;
    then #reply message playbackStarted from entertainmentSystem to Passenger;
  }

  interaction def ChargeSequence {
    doc /* Precondition Unlocked. Postcondition Charging. The driver plugs in. The charge inlet detects the plug, the battery negotiates a session with the charger, the vehicle controller locks the plug and inhibits driving, and the cluster shows the state of charge. */
    lifeline Driver;
    lifeline Charger;
    lifeline chargeInlet;
    lifeline battery;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message connectPlug from Driver to chargeInlet;
    then message plugDetected from chargeInlet to battery;
    then message plugInserted from battery to vehicleController;
    then message lockPlug from vehicleController to chargeInlet;
    then message requestSession from battery to Charger;
    then #reply message sessionAccepted from Charger to battery;
    then message deliverEnergy from Charger to chargeInlet;
    then message storeEnergy from chargeInlet to battery;
    then message stateOfCharge from battery to vehicleController;
    then message showStateOfCharge from vehicleController to instrumentCluster;
    then #reply message indicateCharging from instrumentCluster to Driver;
  }

  interaction def EndChargeSequence {
    doc /* Precondition Charging. Postcondition Unlocked. The driver presses unlock to end the session. The battery stops the session with the charger, the vehicle controller releases the plug lock and the cluster shows the final state of charge. */
    lifeline Driver;
    lifeline Charger;
    lifeline keyFob;
    lifeline vehicleController;
    lifeline battery;
    lifeline chargeInlet;
    lifeline instrumentCluster;
    message pressUnlock from Driver to keyFob;
    then message credential from keyFob to vehicleController;
    then message stopSession from vehicleController to battery;
    then message endSession from battery to Charger;
    then #reply message sessionEnded from Charger to battery;
    then message unlockPlug from vehicleController to chargeInlet;
    then message finalStateOfCharge from battery to vehicleController;
    then message showStateOfCharge from vehicleController to instrumentCluster;
    then #reply message plugReleased from chargeInlet to Driver;
  }

  // ---------------------------------------------------------------- Driving

  interaction def StartVehicleSequence {
    doc /* Precondition Unlocked. Postcondition Ready. The driver holds the brake and presses start. The vehicle controller re-checks the key, releases the immobilizer, closes the high-voltage contactor and shows Ready once the drive controller reports it is live. */
    lifeline Driver;
    lifeline brakePedal;
    lifeline startButton;
    lifeline vehicleController;
    lifeline keyFob;
    lifeline battery;
    lifeline driveController;
    lifeline instrumentCluster;
    message holdBrake from Driver to brakePedal;
    then message pressStart from Driver to startButton;
    then message startRequest from startButton to vehicleController;
    then message brakeHeld from brakePedal to vehicleController;
    then message challenge from vehicleController to keyFob;
    then #reply message credential from keyFob to vehicleController;
    then message closeContactor from vehicleController to battery;
    then #reply message highVoltageOn from battery to vehicleController;
    then message releaseImmobilizer from vehicleController to driveController;
    then #reply message driveReady from driveController to vehicleController;
    then message showReady from vehicleController to instrumentCluster;
    then #reply message indicateReady from instrumentCluster to Driver;
  }

  interaction def StopVehicleSequence {
    doc /* Precondition Parked. Postcondition Unlocked. With park selected the driver presses start again. The vehicle controller disables the drive controller, opens the high-voltage contactor, re-arms the immobilizer and the cluster goes dark. */
    lifeline Driver;
    lifeline startButton;
    lifeline vehicleController;
    lifeline driveController;
    lifeline battery;
    lifeline instrumentCluster;
    message pressStart from Driver to startButton;
    then message stopRequest from startButton to vehicleController;
    then message queryGear from vehicleController to driveController;
    then #reply message parkSelected from driveController to vehicleController;
    then message disableDrive from vehicleController to driveController;
    then message openContactor from vehicleController to battery;
    then #reply message highVoltageOff from battery to vehicleController;
    then message showOff from vehicleController to instrumentCluster;
    then #reply message indicateOff from instrumentCluster to Driver;
  }

  interaction def ChangeGearSequence {
    doc /* Precondition Ready. Postcondition Driving. The driver moves the gear stick. The drive controller checks the car is standing still with the brake pressed, sets the motor mode and reports the gear to the cluster. */
    lifeline Driver;
    lifeline gearStick;
    lifeline driveController;
    lifeline wheels;
    lifeline engine;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message selectDrive from Driver to gearStick;
    then message gearRequest from gearStick to driveController;
    then message queryWheelSpeed from driveController to wheels;
    then #reply message standingStill from wheels to driveController;
    then message setMotorMode from driveController to engine;
    then #reply message modeSet from engine to driveController;
    then message gearChanged from driveController to vehicleController;
    then message showGear from vehicleController to instrumentCluster;
    then #reply message indicateGear from instrumentCluster to Driver;
  }

  interaction def AccelerateSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver presses the accelerator. The drive controller turns pedal travel into a torque command bounded by the battery's discharge limit, the engine draws power and drives the wheels, and the cluster shows speed. */
    lifeline Driver;
    lifeline acceleratorPedal;
    lifeline driveController;
    lifeline battery;
    lifeline engine;
    lifeline wheels;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message pressPedal from Driver to acceleratorPedal;
    then message torqueRequest from acceleratorPedal to driveController;
    then message queryDischargeLimit from driveController to battery;
    then #reply message dischargeLimit from battery to driveController;
    then message torqueCommand from driveController to engine;
    then message drawPower from engine to battery;
    then message driveTorque from engine to wheels;
    then #reply message wheelSpeed from wheels to driveController;
    then message speedChanged from driveController to vehicleController;
    then message showSpeed from vehicleController to instrumentCluster;
    then #reply message indicateSpeed from instrumentCluster to Driver;
  }

  interaction def BrakeSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver presses the brake pedal. The drive controller lights the brake lamps, blends regenerative torque on the motor with friction pressure on the calipers, and the wheels slow. */
    lifeline Driver;
    lifeline brakePedal;
    lifeline driveController;
    lifeline bodyController;
    lifeline lamps;
    lifeline engine;
    lifeline frictionBrakes;
    lifeline wheels;
    lifeline battery;
    message pressPedal from Driver to brakePedal;
    then message decelerationRequest from brakePedal to driveController;
    then message brakeLampsOn from driveController to bodyController;
    then message lightBrakeLamps from bodyController to lamps;
    then message regenTorque from driveController to engine;
    then message chargePower from engine to battery;
    then message frictionPressure from driveController to frictionBrakes;
    then message brakingForce from frictionBrakes to wheels;
    then #reply message wheelSpeed from wheels to driveController;
    then #reply message pedalFeedback from brakePedal to Driver;
  }

  interaction def EmergencyStopSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver brakes hard from speed. Extends Brake: the drive controller commands maximum deceleration, modulates the calipers against wheel lock and the body controller switches the hazard lights on. */
    lifeline Driver;
    lifeline brakePedal;
    lifeline driveController;
    lifeline bodyController;
    lifeline lamps;
    lifeline engine;
    lifeline frictionBrakes;
    lifeline wheels;
    lifeline battery;
    message pressPedal from Driver to brakePedal;
    then message decelerationRequest from brakePedal to driveController;
    then message maximumDeceleration from brakePedal to driveController;
    then message brakeLampsOn from driveController to bodyController;
    then message lightBrakeLamps from bodyController to lamps;
    then message hazardLightsOn from bodyController to lamps;
    then message regenTorque from driveController to engine;
    then message chargePower from engine to battery;
    then message frictionPressure from driveController to frictionBrakes;
    then message antiLockModulation from driveController to frictionBrakes;
    then message brakingForce from frictionBrakes to wheels;
    then #reply message wheelSpeed from wheels to driveController;
    then #reply message pedalFeedback from brakePedal to Driver;
  }

  interaction def TurnLeftSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver turns the steering wheel left. The drive controller scales the angle with vehicle speed, commands the wheel angle and the body controller flashes the left indicator. */
    lifeline Driver;
    lifeline steeringWheel;
    lifeline driveController;
    lifeline wheels;
    lifeline bodyController;
    lifeline lamps;
    message turnWheelLeft from Driver to steeringWheel;
    then message steeringAngle from steeringWheel to driveController;
    then message queryWheelSpeed from driveController to wheels;
    then #reply message wheelSpeed from wheels to driveController;
    then message applyLeftAngle from driveController to wheels;
    then message indicateLeft from driveController to bodyController;
    then message flashLeftIndicator from bodyController to lamps;
    then #reply message carTurnsLeft from wheels to Driver;
  }

  interaction def TurnRightSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver turns the steering wheel right. Same path as TurnLeft with the opposite angle and the right indicator. */
    lifeline Driver;
    lifeline steeringWheel;
    lifeline driveController;
    lifeline wheels;
    lifeline bodyController;
    lifeline lamps;
    message turnWheelRight from Driver to steeringWheel;
    then message steeringAngle from steeringWheel to driveController;
    then message queryWheelSpeed from driveController to wheels;
    then #reply message wheelSpeed from wheels to driveController;
    then message applyRightAngle from driveController to wheels;
    then message indicateRight from driveController to bodyController;
    then message flashRightIndicator from bodyController to lamps;
    then #reply message carTurnsRight from wheels to Driver;
  }

  interaction def CleanWindshieldSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver pulls the wiper stalk. The body controller sets a wipe rate from vehicle speed, pulses the washer, the wipers sweep the glass and report when they have parked. */
    lifeline Driver;
    lifeline bodyController;
    lifeline driveController;
    lifeline wipers;
    lifeline windshield;
    message requestWipe from Driver to bodyController;
    then message queryVehicleSpeed from bodyController to driveController;
    then #reply message vehicleSpeed from driveController to bodyController;
    then message washPulse from bodyController to wipers;
    then message sweepAtRate from bodyController to wipers;
    then message clearGlass from wipers to windshield;
    then #reply message bladesParked from wipers to bodyController;
    then #reply message viewCleared from windshield to Driver;
  }

  interaction def ToggleHeadlightsSequence {
    doc /* Precondition Ready. Postcondition Ready. The driver turns the light switch. The body controller draws power, lights the headlamps and the cluster shows the beam symbol. */
    lifeline Driver;
    lifeline bodyController;
    lifeline battery;
    lifeline lamps;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message switchHeadlampsOn from Driver to bodyController;
    then message requestPower from bodyController to battery;
    then #reply message powerGranted from battery to bodyController;
    then message lightHeadlamps from bodyController to lamps;
    then #reply message headlampsLit from lamps to bodyController;
    then message headlampState from bodyController to vehicleController;
    then message showBeamSymbol from vehicleController to instrumentCluster;
    then #reply message roadLit from lamps to Driver;
  }

  interaction def ParkSequence {
    doc /* Precondition Driving. Postcondition Parked. The driver stops, holds the brake and selects park. The drive controller confirms the car is standing still, sets park, locks the parking pawl through the friction brakes and the cluster shows P. */
    lifeline Driver;
    lifeline brakePedal;
    lifeline gearStick;
    lifeline driveController;
    lifeline wheels;
    lifeline engine;
    lifeline frictionBrakes;
    lifeline vehicleController;
    lifeline instrumentCluster;
    message holdBrake from Driver to brakePedal;
    then message decelerationRequest from brakePedal to driveController;
    then message selectPark from Driver to gearStick;
    then message gearRequest from gearStick to driveController;
    then message queryWheelSpeed from driveController to wheels;
    then #reply message standingStill from wheels to driveController;
    then message setParkMode from driveController to engine;
    then message applyParkingBrake from driveController to frictionBrakes;
    then message gearChanged from driveController to vehicleController;
    then message showPark from vehicleController to instrumentCluster;
    then #reply message indicatePark from instrumentCluster to Driver;
  }

  interaction def DriveSequence {
    doc /* Precondition Unlocked. Postcondition Parked. The journey as one scenario: start, select drive, accelerate, steer, brake and park. The detailed sequences for each step are the included use cases; this one shows the hand-overs between the controllers. */
    lifeline Driver;
    lifeline startButton;
    lifeline vehicleController;
    lifeline driveController;
    lifeline gearStick;
    lifeline acceleratorPedal;
    lifeline steeringWheel;
    lifeline brakePedal;
    lifeline instrumentCluster;
    message pressStart from Driver to startButton;
    then message startRequest from startButton to vehicleController;
    then message releaseImmobilizer from vehicleController to driveController;
    then message selectDrive from Driver to gearStick;
    then message gearRequest from gearStick to driveController;
    then message pressAccelerator from Driver to acceleratorPedal;
    then message torqueRequest from acceleratorPedal to driveController;
    then message turnWheel from Driver to steeringWheel;
    then message steeringAngle from steeringWheel to driveController;
    then message pressBrake from Driver to brakePedal;
    then message decelerationRequest from brakePedal to driveController;
    then message selectPark from Driver to gearStick;
    then message parkRequest from gearStick to driveController;
    then message gearChanged from driveController to vehicleController;
    then message showPark from vehicleController to instrumentCluster;
    then #reply message indicatePark from instrumentCluster to Driver;
  }

  // ---------------------------------------------------------------- Views

  view def VehicleModesView : StateTransitionView {
    doc /* Modes of the car and the use cases that move it between them. */
    expose VehicleModes;
  }

  view def UnlockSequenceView : SequenceView {
    doc /* Sequence for the Unlock use case. */
    expose UnlockSequence;
  }
  view def UnlockDeniedSequenceView : SequenceView {
    doc /* Alternative flow of Unlock: the credential is rejected. */
    expose UnlockDeniedSequence;
  }
  view def LockSequenceView : SequenceView {
    doc /* Sequence for the Lock use case. */
    expose LockSequence;
  }
  view def OpenDoorSequenceView : SequenceView {
    doc /* Sequence for the OpenDoor use case. */
    expose OpenDoorSequence;
  }
  view def CloseDoorSequenceView : SequenceView {
    doc /* Sequence for the CloseDoor use case. */
    expose CloseDoorSequence;
  }
  view def OpenWindowSequenceView : SequenceView {
    doc /* Sequence for the OpenWindow use case. */
    expose OpenWindowSequence;
  }
  view def CloseWindowSequenceView : SequenceView {
    doc /* Sequence for the CloseWindow use case. */
    expose CloseWindowSequence;
  }
  view def AdjustClimateSequenceView : SequenceView {
    doc /* Sequence for the AdjustClimate use case. */
    expose AdjustClimateSequence;
  }
  view def PlayMediaSequenceView : SequenceView {
    doc /* Sequence for the PlayMedia use case. */
    expose PlayMediaSequence;
  }
  view def ChargeSequenceView : SequenceView {
    doc /* Sequence for the Charge use case. */
    expose ChargeSequence;
  }
  view def EndChargeSequenceView : SequenceView {
    doc /* End of a charge session, back to Unlocked. */
    expose EndChargeSequence;
  }
  view def StartVehicleSequenceView : SequenceView {
    doc /* Sequence for the StartVehicle use case. */
    expose StartVehicleSequence;
  }
  view def StopVehicleSequenceView : SequenceView {
    doc /* Sequence for the StopVehicle use case. */
    expose StopVehicleSequence;
  }
  view def ChangeGearSequenceView : SequenceView {
    doc /* Sequence for the ChangeGear use case. */
    expose ChangeGearSequence;
  }
  view def AccelerateSequenceView : SequenceView {
    doc /* Sequence for the Accelerate use case. */
    expose AccelerateSequence;
  }
  view def BrakeSequenceView : SequenceView {
    doc /* Sequence for the Brake use case. */
    expose BrakeSequence;
  }
  view def EmergencyStopSequenceView : SequenceView {
    doc /* Sequence for the EmergencyStop use case. */
    expose EmergencyStopSequence;
  }
  view def TurnLeftSequenceView : SequenceView {
    doc /* Sequence for the TurnLeft use case. */
    expose TurnLeftSequence;
  }
  view def TurnRightSequenceView : SequenceView {
    doc /* Sequence for the TurnRight use case. */
    expose TurnRightSequence;
  }
  view def CleanWindshieldSequenceView : SequenceView {
    doc /* Sequence for the CleanWindshield use case. */
    expose CleanWindshieldSequence;
  }
  view def ToggleHeadlightsSequenceView : SequenceView {
    doc /* Sequence for the ToggleHeadlights use case. */
    expose ToggleHeadlightsSequence;
  }
  view def ParkSequenceView : SequenceView {
    doc /* Sequence for the Park use case. */
    expose ParkSequence;
  }
  view def DriveSequenceView : SequenceView {
    doc /* Sequence for the Drive use case: the whole journey. */
    expose DriveSequence;
  }
}
