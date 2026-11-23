package Dynamics {
  doc /* Dynamics of the electric car. VehicleModes is the state machine every scenario moves through. Each occurrence def is one use case drawn as a sequence: an actor asks, a controller decides, actuators act, and the driver gets an acknowledgement (dashed «Reply» message). The lifelines are the parts of the occurrence: reference parts typed by the logical part defs of LogicalArchitecture::Types (and by the actor defs), named like the logical parts, so the sequences and the logical architecture read as one model. Messages are drawn in the order they are declared. Each occurrence def states the mode it starts in and the mode it ends in. */

  private import LogicalArchitecture::Types::*;

  // Marks a message as the answer to an earlier one; the viewer draws it dashed.
  metadata def Reply;

  part def Driver {
    doc /* The person driving. Plays the Driver actor of the use cases in the sequences. */
  }
  part def Passenger {
    doc /* A person riding in the car. Plays the Passenger actor of the use cases in the sequences. */
  }
  part def Charger {
    doc /* The external charging station. Plays the Charger actor of the use cases in the sequences. */
  }

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

  occurrence def UnlockSequence {
    doc /* Precondition Locked. Postcondition Unlocked. The driver presses unlock on the key fob. The vehicle controller authenticates the credential, the body controller releases the latches and flashes the indicators, and the cabin wakes. The immobilizer stays armed. */
    ref part Driver : Driver;
    ref part keyFob : KeyFob;
    ref part vehicleController : VehicleController;
    ref part bodyController : BodyController;
    ref part locks : Locks;
    ref part lamps : Lamps;
    ref part climateSystem : ClimateSystem;
    message pressUnlock from Driver to keyFob;
    message credential from keyFob to vehicleController;
    message authenticated from vehicleController to bodyController;
    message releaseLatches from bodyController to locks;
    #Reply message latchesReleased from locks to bodyController;
    message flashIndicators from bodyController to lamps;
    message wakeCabin from vehicleController to climateSystem;
    #Reply message indicateUnlocked from lamps to Driver;
  }

  occurrence def UnlockDeniedSequence {
    doc /* Precondition Locked. Postcondition Locked. Alternative to Unlock: the credential does not match. The vehicle controller refuses, the latches stay engaged and the driver sees no indicator flash. */
    ref part Driver : Driver;
    ref part keyFob : KeyFob;
    ref part vehicleController : VehicleController;
    ref part bodyController : BodyController;
    ref part locks : Locks;
    message pressUnlock from Driver to keyFob;
    message credential from keyFob to vehicleController;
    message credentialRejected from vehicleController to bodyController;
    message keepLatches from bodyController to locks;
    #Reply message latchesHeld from locks to bodyController;
    #Reply message noResponse from keyFob to Driver;
  }

  occurrence def LockSequence {
    doc /* Precondition Unlocked. Postcondition Locked. The driver presses lock on the key fob. The vehicle controller authenticates, the body controller checks that every door is closed, engages the latches and flashes the indicators as confirmation. */
    ref part Driver : Driver;
    ref part keyFob : KeyFob;
    ref part vehicleController : VehicleController;
    ref part bodyController : BodyController;
    ref part doors : Doors;
    ref part locks : Locks;
    ref part lamps : Lamps;
    message pressLock from Driver to keyFob;
    message credential from keyFob to vehicleController;
    message authenticated from vehicleController to bodyController;
    message queryDoorsClosed from bodyController to doors;
    #Reply message allDoorsClosed from doors to bodyController;
    message engageLatches from bodyController to locks;
    #Reply message latchesEngaged from locks to bodyController;
    message flashIndicators from bodyController to lamps;
    #Reply message indicateLocked from lamps to Driver;
  }

  occurrence def OpenDoorSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant pulls the handle. The body controller confirms the car is unlocked, releases that door's latch and raises the door-ajar warning on the cluster. */
    ref part Passenger : Passenger;
    ref part doors : Doors;
    ref part bodyController : BodyController;
    ref part locks : Locks;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message pullHandle from Passenger to doors;
    message handleRequest from doors to bodyController;
    message releaseLatch from bodyController to locks;
    #Reply message latchReleased from locks to bodyController;
    message doorAjar from bodyController to vehicleController;
    message showDoorAjar from vehicleController to instrumentCluster;
    #Reply message doorSwingsOpen from doors to Passenger;
  }

  occurrence def CloseDoorSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant pushes the door shut. The latch engages, the body controller clears the door-ajar warning and the cluster stops showing it. */
    ref part Passenger : Passenger;
    ref part doors : Doors;
    ref part locks : Locks;
    ref part bodyController : BodyController;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message pushDoorShut from Passenger to doors;
    message latchEngage from doors to locks;
    #Reply message latchEngaged from locks to bodyController;
    message doorClosed from bodyController to vehicleController;
    message clearDoorAjar from vehicleController to instrumentCluster;
    #Reply message doorSeated from doors to Passenger;
  }

  occurrence def OpenWindowSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant holds the window switch down. The body controller drives the lift motor from battery power until the switch is released or the window is fully open. */
    ref part Passenger : Passenger;
    ref part windowLifts : WindowLifts;
    ref part bodyController : BodyController;
    ref part battery : Battery;
    ref part windows : Windows;
    message pressSwitchDown from Passenger to windowLifts;
    message lowerRequest from windowLifts to bodyController;
    message lowerWindow from bodyController to windowLifts;
    message drawPower from windowLifts to battery;
    message moveGlassDown from windowLifts to windows;
    #Reply message fullyOpen from windows to bodyController;
    #Reply message windowOpen from windowLifts to Passenger;
  }

  occurrence def CloseWindowSequence {
    doc /* Precondition Unlocked. Postcondition Unlocked. An occupant holds the window switch up. The body controller raises the window and watches the motor current; a pinch reverses the glass before it closes. */
    ref part Passenger : Passenger;
    ref part windowLifts : WindowLifts;
    ref part bodyController : BodyController;
    ref part battery : Battery;
    ref part windows : Windows;
    message pressSwitchUp from Passenger to windowLifts;
    message raiseRequest from windowLifts to bodyController;
    message raiseWindow from bodyController to windowLifts;
    message drawPower from windowLifts to battery;
    message moveGlassUp from windowLifts to windows;
    message pinchCheck from windowLifts to bodyController;
    #Reply message fullyClosed from windows to bodyController;
    #Reply message windowClosed from windowLifts to Passenger;
  }

  occurrence def AdjustClimateSequence {
    doc /* Precondition Ready. Postcondition Ready. The driver sets a temperature. The climate system asks the battery for power, drives heater, compressor and fans, and the cluster shows the set point. */
    ref part Driver : Driver;
    ref part climateSystem : ClimateSystem;
    ref part battery : Battery;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message setTemperature from Driver to climateSystem;
    message requestPower from climateSystem to battery;
    #Reply message powerGranted from battery to climateSystem;
    message setPointChanged from climateSystem to vehicleController;
    message showSetPoint from vehicleController to instrumentCluster;
    #Reply message airFlows from climateSystem to Driver;
  }

  occurrence def PlayMediaSequence {
    doc /* Precondition Ready. Postcondition Ready. A passenger selects a title. The entertainment system checks the cabin is awake, draws power, starts playback and shows now playing. */
    ref part Passenger : Passenger;
    ref part entertainmentSystem : EntertainmentSystem;
    ref part vehicleController : VehicleController;
    ref part battery : Battery;
    ref part instrumentCluster : InstrumentCluster;
    message selectTitle from Passenger to entertainmentSystem;
    message queryCabinAwake from entertainmentSystem to vehicleController;
    #Reply message cabinAwake from vehicleController to entertainmentSystem;
    message requestPower from entertainmentSystem to battery;
    message nowPlaying from entertainmentSystem to instrumentCluster;
    #Reply message playbackStarted from entertainmentSystem to Passenger;
  }

  occurrence def ChargeSequence {
    doc /* Precondition Unlocked. Postcondition Charging. The driver plugs in. The charge inlet detects the plug, the battery negotiates a session with the charger, the vehicle controller locks the plug and inhibits driving, and the cluster shows the state of charge. */
    ref part Driver : Driver;
    ref part Charger : Charger;
    ref part chargeInlet : ChargeInlet;
    ref part battery : Battery;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message connectPlug from Driver to chargeInlet;
    message plugDetected from chargeInlet to battery;
    message plugInserted from battery to vehicleController;
    message lockPlug from vehicleController to chargeInlet;
    message requestSession from battery to Charger;
    #Reply message sessionAccepted from Charger to battery;
    message deliverEnergy from Charger to chargeInlet;
    message storeEnergy from chargeInlet to battery;
    message stateOfCharge from battery to vehicleController;
    message showStateOfCharge from vehicleController to instrumentCluster;
    #Reply message indicateCharging from instrumentCluster to Driver;
  }

  occurrence def EndChargeSequence {
    doc /* Precondition Charging. Postcondition Unlocked. The driver presses unlock to end the session. The battery stops the session with the charger, the vehicle controller releases the plug lock and the cluster shows the final state of charge. */
    ref part Driver : Driver;
    ref part Charger : Charger;
    ref part keyFob : KeyFob;
    ref part vehicleController : VehicleController;
    ref part battery : Battery;
    ref part chargeInlet : ChargeInlet;
    ref part instrumentCluster : InstrumentCluster;
    message pressUnlock from Driver to keyFob;
    message credential from keyFob to vehicleController;
    message stopSession from vehicleController to battery;
    message endSession from battery to Charger;
    #Reply message sessionEnded from Charger to battery;
    message unlockPlug from vehicleController to chargeInlet;
    message finalStateOfCharge from battery to vehicleController;
    message showStateOfCharge from vehicleController to instrumentCluster;
    #Reply message plugReleased from chargeInlet to Driver;
  }

  // ---------------------------------------------------------------- Driving

  occurrence def StartVehicleSequence {
    doc /* Precondition Unlocked. Postcondition Ready. The driver holds the brake and presses start. The vehicle controller re-checks the key, releases the immobilizer, closes the high-voltage contactor and shows Ready once the drive controller reports it is live. */
    ref part Driver : Driver;
    ref part brakePedal : BrakePedal;
    ref part startButton : StartButton;
    ref part vehicleController : VehicleController;
    ref part keyFob : KeyFob;
    ref part battery : Battery;
    ref part driveController : DriveController;
    ref part instrumentCluster : InstrumentCluster;
    message holdBrake from Driver to brakePedal;
    message pressStart from Driver to startButton;
    message startRequest from startButton to vehicleController;
    message brakeHeld from brakePedal to vehicleController;
    message challenge from vehicleController to keyFob;
    #Reply message credential from keyFob to vehicleController;
    message releaseImmobilizer from vehicleController to driveController;
    message closeContactor from vehicleController to battery;
    #Reply message highVoltageOn from battery to vehicleController;
    #Reply message driveReady from driveController to vehicleController;
    message showReady from vehicleController to instrumentCluster;
    #Reply message indicateReady from instrumentCluster to Driver;
  }

  occurrence def StopVehicleSequence {
    doc /* Precondition Parked. Postcondition Unlocked. With park selected the driver presses start again. The vehicle controller disables the drive controller, opens the high-voltage contactor, re-arms the immobilizer and the cluster goes dark. */
    ref part Driver : Driver;
    ref part startButton : StartButton;
    ref part vehicleController : VehicleController;
    ref part driveController : DriveController;
    ref part battery : Battery;
    ref part instrumentCluster : InstrumentCluster;
    message pressStart from Driver to startButton;
    message stopRequest from startButton to vehicleController;
    message queryGear from vehicleController to driveController;
    #Reply message parkSelected from driveController to vehicleController;
    message disableDrive from vehicleController to driveController;
    message openContactor from vehicleController to battery;
    #Reply message highVoltageOff from battery to vehicleController;
    message showOff from vehicleController to instrumentCluster;
    #Reply message indicateOff from instrumentCluster to Driver;
  }

  occurrence def ChangeGearSequence {
    doc /* Precondition Ready. Postcondition Driving. The driver moves the gear stick. The drive controller checks the car is standing still with the brake pressed, sets the motor mode and reports the gear to the cluster. */
    ref part Driver : Driver;
    ref part gearStick : GearStick;
    ref part driveController : DriveController;
    ref part wheels : Wheels;
    ref part engine : Engine;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message selectDrive from Driver to gearStick;
    message gearRequest from gearStick to driveController;
    message queryWheelSpeed from driveController to wheels;
    #Reply message standingStill from wheels to driveController;
    message setMotorMode from driveController to engine;
    #Reply message modeSet from engine to driveController;
    message gearChanged from driveController to vehicleController;
    message showGear from vehicleController to instrumentCluster;
    #Reply message indicateGear from instrumentCluster to Driver;
  }

  occurrence def AccelerateSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver presses the accelerator. The drive controller turns pedal travel into a torque command bounded by the battery's discharge limit, the engine draws power and drives the wheels, and the cluster shows speed. */
    ref part Driver : Driver;
    ref part acceleratorPedal : AcceleratorPedal;
    ref part driveController : DriveController;
    ref part battery : Battery;
    ref part engine : Engine;
    ref part wheels : Wheels;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message pressPedal from Driver to acceleratorPedal;
    message torqueRequest from acceleratorPedal to driveController;
    message queryDischargeLimit from driveController to battery;
    #Reply message dischargeLimit from battery to driveController;
    message torqueCommand from driveController to engine;
    message drawPower from engine to battery;
    message driveTorque from engine to wheels;
    #Reply message wheelSpeed from wheels to driveController;
    message speedChanged from driveController to vehicleController;
    message showSpeed from vehicleController to instrumentCluster;
    #Reply message indicateSpeed from instrumentCluster to Driver;
  }

  occurrence def BrakeSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver presses the brake pedal. The drive controller lights the brake lamps, blends regenerative torque on the motor with friction pressure on the calipers, and the wheels slow. */
    ref part Driver : Driver;
    ref part brakePedal : BrakePedal;
    ref part driveController : DriveController;
    ref part bodyController : BodyController;
    ref part lamps : Lamps;
    ref part engine : Engine;
    ref part frictionBrakes : FrictionBrakes;
    ref part wheels : Wheels;
    ref part battery : Battery;
    message pressPedal from Driver to brakePedal;
    message decelerationRequest from brakePedal to driveController;
    message brakeLampsOn from driveController to bodyController;
    message lightBrakeLamps from bodyController to lamps;
    message regenTorque from driveController to engine;
    message chargePower from engine to battery;
    message frictionPressure from driveController to frictionBrakes;
    message brakingForce from frictionBrakes to wheels;
    #Reply message wheelSpeed from wheels to driveController;
    #Reply message pedalFeedback from brakePedal to Driver;
  }

  occurrence def EmergencyStopSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver brakes hard from speed. Extends Brake: the drive controller commands maximum deceleration, modulates the calipers against wheel lock and the body controller switches the hazard lights on. */
    ref part Driver : Driver;
    ref part brakePedal : BrakePedal;
    ref part driveController : DriveController;
    ref part bodyController : BodyController;
    ref part lamps : Lamps;
    ref part engine : Engine;
    ref part frictionBrakes : FrictionBrakes;
    ref part wheels : Wheels;
    ref part battery : Battery;
    message pressPedal from Driver to brakePedal;
    message decelerationRequest from brakePedal to driveController;
    message maximumDeceleration from brakePedal to driveController;
    message brakeLampsOn from driveController to bodyController;
    message lightBrakeLamps from bodyController to lamps;
    message hazardLightsOn from bodyController to lamps;
    message regenTorque from driveController to engine;
    message chargePower from engine to battery;
    message frictionPressure from driveController to frictionBrakes;
    message antiLockModulation from driveController to frictionBrakes;
    message brakingForce from frictionBrakes to wheels;
    #Reply message wheelSpeed from wheels to driveController;
    #Reply message pedalFeedback from brakePedal to Driver;
  }

  occurrence def TurnLeftSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver turns the steering wheel left. The drive controller scales the angle with vehicle speed, commands the wheel angle and the body controller flashes the left indicator. */
    ref part Driver : Driver;
    ref part steeringWheel : SteeringWheel;
    ref part driveController : DriveController;
    ref part wheels : Wheels;
    ref part bodyController : BodyController;
    ref part lamps : Lamps;
    message turnWheelLeft from Driver to steeringWheel;
    message steeringAngle from steeringWheel to driveController;
    message queryWheelSpeed from driveController to wheels;
    #Reply message wheelSpeed from wheels to driveController;
    message applyLeftAngle from driveController to wheels;
    message indicateLeft from driveController to bodyController;
    message flashLeftIndicator from bodyController to lamps;
    #Reply message carTurnsLeft from wheels to Driver;
  }

  occurrence def TurnRightSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver turns the steering wheel right. Same path as TurnLeft with the opposite angle and the right indicator. */
    ref part Driver : Driver;
    ref part steeringWheel : SteeringWheel;
    ref part driveController : DriveController;
    ref part wheels : Wheels;
    ref part bodyController : BodyController;
    ref part lamps : Lamps;
    message turnWheelRight from Driver to steeringWheel;
    message steeringAngle from steeringWheel to driveController;
    message queryWheelSpeed from driveController to wheels;
    #Reply message wheelSpeed from wheels to driveController;
    message applyRightAngle from driveController to wheels;
    message indicateRight from driveController to bodyController;
    message flashRightIndicator from bodyController to lamps;
    #Reply message carTurnsRight from wheels to Driver;
  }

  occurrence def CleanWindshieldSequence {
    doc /* Precondition Driving. Postcondition Driving. The driver pulls the wiper stalk. The body controller sets a wipe rate from vehicle speed, pulses the washer, the wipers sweep the glass and report when they have parked. */
    ref part Driver : Driver;
    ref part bodyController : BodyController;
    ref part driveController : DriveController;
    ref part wipers : Wipers;
    ref part windshield : Windshield;
    message requestWipe from Driver to bodyController;
    message queryVehicleSpeed from bodyController to driveController;
    #Reply message vehicleSpeed from driveController to bodyController;
    message washPulse from bodyController to wipers;
    message sweepAtRate from bodyController to wipers;
    message clearGlass from wipers to windshield;
    #Reply message bladesParked from wipers to bodyController;
    #Reply message viewCleared from windshield to Driver;
  }

  occurrence def ToggleHeadlightsSequence {
    doc /* Precondition Ready. Postcondition Ready. The driver turns the light switch. The body controller draws power, lights the headlamps and the cluster shows the beam symbol. */
    ref part Driver : Driver;
    ref part bodyController : BodyController;
    ref part battery : Battery;
    ref part lamps : Lamps;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message switchHeadlampsOn from Driver to bodyController;
    message requestPower from bodyController to battery;
    #Reply message powerGranted from battery to bodyController;
    message lightHeadlamps from bodyController to lamps;
    #Reply message headlampsLit from lamps to bodyController;
    message headlampState from bodyController to vehicleController;
    message showBeamSymbol from vehicleController to instrumentCluster;
    #Reply message roadLit from lamps to Driver;
  }

  occurrence def ParkSequence {
    doc /* Precondition Driving. Postcondition Parked. The driver stops, holds the brake and selects park. The drive controller confirms the car is standing still, sets park, locks the parking pawl through the friction brakes and the cluster shows P. */
    ref part Driver : Driver;
    ref part brakePedal : BrakePedal;
    ref part gearStick : GearStick;
    ref part driveController : DriveController;
    ref part wheels : Wheels;
    ref part engine : Engine;
    ref part frictionBrakes : FrictionBrakes;
    ref part vehicleController : VehicleController;
    ref part instrumentCluster : InstrumentCluster;
    message holdBrake from Driver to brakePedal;
    message decelerationRequest from brakePedal to driveController;
    message selectPark from Driver to gearStick;
    message gearRequest from gearStick to driveController;
    message queryWheelSpeed from driveController to wheels;
    #Reply message standingStill from wheels to driveController;
    message setParkMode from driveController to engine;
    message applyParkingBrake from driveController to frictionBrakes;
    message gearChanged from driveController to vehicleController;
    message showPark from vehicleController to instrumentCluster;
    #Reply message indicatePark from instrumentCluster to Driver;
  }

  occurrence def DriveSequence {
    doc /* Precondition Unlocked. Postcondition Parked. The journey as one scenario: start, select drive, accelerate, steer, brake and park. The detailed sequences for each step are the included use cases; this one shows the hand-overs between the controllers. */
    ref part Driver : Driver;
    ref part startButton : StartButton;
    ref part vehicleController : VehicleController;
    ref part driveController : DriveController;
    ref part gearStick : GearStick;
    ref part acceleratorPedal : AcceleratorPedal;
    ref part steeringWheel : SteeringWheel;
    ref part brakePedal : BrakePedal;
    ref part instrumentCluster : InstrumentCluster;
    message pressStart from Driver to startButton;
    message startRequest from startButton to vehicleController;
    message releaseImmobilizer from vehicleController to driveController;
    message selectDrive from Driver to gearStick;
    message gearRequest from gearStick to driveController;
    message pressAccelerator from Driver to acceleratorPedal;
    message torqueRequest from acceleratorPedal to driveController;
    message turnWheel from Driver to steeringWheel;
    message steeringAngle from steeringWheel to driveController;
    message pressBrake from Driver to brakePedal;
    message decelerationRequest from brakePedal to driveController;
    message selectPark from Driver to gearStick;
    message parkRequest from gearStick to driveController;
    message gearChanged from driveController to vehicleController;
    message showPark from vehicleController to instrumentCluster;
    #Reply message indicatePark from instrumentCluster to Driver;
  }

  // ---------------------------------------------------------------- Views

  view VehicleModesView : StateTransitionView {
    doc /* Modes of the car and the use cases that move it between them. */
    expose VehicleModes;
  }

  view UnlockSequenceView : SequenceView {
    doc /* Sequence for the Unlock use case. */
    expose UnlockSequence;
  }
  view UnlockDeniedSequenceView : SequenceView {
    doc /* Alternative flow of Unlock: the credential is rejected. */
    expose UnlockDeniedSequence;
  }
  view LockSequenceView : SequenceView {
    doc /* Sequence for the Lock use case. */
    expose LockSequence;
  }
  view OpenDoorSequenceView : SequenceView {
    doc /* Sequence for the OpenDoor use case. */
    expose OpenDoorSequence;
  }
  view CloseDoorSequenceView : SequenceView {
    doc /* Sequence for the CloseDoor use case. */
    expose CloseDoorSequence;
  }
  view OpenWindowSequenceView : SequenceView {
    doc /* Sequence for the OpenWindow use case. */
    expose OpenWindowSequence;
  }
  view CloseWindowSequenceView : SequenceView {
    doc /* Sequence for the CloseWindow use case. */
    expose CloseWindowSequence;
  }
  view AdjustClimateSequenceView : SequenceView {
    doc /* Sequence for the AdjustClimate use case. */
    expose AdjustClimateSequence;
  }
  view PlayMediaSequenceView : SequenceView {
    doc /* Sequence for the PlayMedia use case. */
    expose PlayMediaSequence;
  }
  view ChargeSequenceView : SequenceView {
    doc /* Sequence for the Charge use case. */
    expose ChargeSequence;
  }
  view EndChargeSequenceView : SequenceView {
    doc /* End of a charge session, back to Unlocked. */
    expose EndChargeSequence;
  }
  view StartVehicleSequenceView : SequenceView {
    doc /* Sequence for the StartVehicle use case. */
    expose StartVehicleSequence;
  }
  view StopVehicleSequenceView : SequenceView {
    doc /* Sequence for the StopVehicle use case. */
    expose StopVehicleSequence;
  }
  view ChangeGearSequenceView : SequenceView {
    doc /* Sequence for the ChangeGear use case. */
    expose ChangeGearSequence;
  }
  view AccelerateSequenceView : SequenceView {
    doc /* Sequence for the Accelerate use case. */
    expose AccelerateSequence;
  }
  view BrakeSequenceView : SequenceView {
    doc /* Sequence for the Brake use case. */
    expose BrakeSequence;
  }
  view EmergencyStopSequenceView : SequenceView {
    doc /* Sequence for the EmergencyStop use case. */
    expose EmergencyStopSequence;
  }
  view TurnLeftSequenceView : SequenceView {
    doc /* Sequence for the TurnLeft use case. */
    expose TurnLeftSequence;
  }
  view TurnRightSequenceView : SequenceView {
    doc /* Sequence for the TurnRight use case. */
    expose TurnRightSequence;
  }
  view CleanWindshieldSequenceView : SequenceView {
    doc /* Sequence for the CleanWindshield use case. */
    expose CleanWindshieldSequence;
  }
  view ToggleHeadlightsSequenceView : SequenceView {
    doc /* Sequence for the ToggleHeadlights use case. */
    expose ToggleHeadlightsSequence;
  }
  view ParkSequenceView : SequenceView {
    doc /* Sequence for the Park use case. */
    expose ParkSequence;
  }
  view DriveSequenceView : SequenceView {
    doc /* Sequence for the Drive use case: the whole journey. */
    expose DriveSequence;
  }

  // ---------------------------------------------------------------- Use cases

  // Each sequence refines the use case it draws; UnlockDenied and EndCharge are
  // alternative and closing flows of Unlock and Charge.
  #refine dependency from UnlockSequence to UseCases::Managing::Unlock;
  #refine dependency from UnlockDeniedSequence to UseCases::Managing::Unlock;
  #refine dependency from LockSequence to UseCases::Managing::Lock;
  #refine dependency from OpenDoorSequence to UseCases::Managing::OpenDoor;
  #refine dependency from CloseDoorSequence to UseCases::Managing::CloseDoor;
  #refine dependency from OpenWindowSequence to UseCases::Managing::OpenWindow;
  #refine dependency from CloseWindowSequence to UseCases::Managing::CloseWindow;
  #refine dependency from AdjustClimateSequence to UseCases::Managing::AdjustClimate;
  #refine dependency from PlayMediaSequence to UseCases::Managing::PlayMedia;
  #refine dependency from ChargeSequence to UseCases::Managing::Charge;
  #refine dependency from EndChargeSequence to UseCases::Managing::Charge;
  #refine dependency from StartVehicleSequence to UseCases::Driving::StartVehicle;
  #refine dependency from StopVehicleSequence to UseCases::Driving::StopVehicle;
  #refine dependency from ChangeGearSequence to UseCases::Driving::ChangeGear;
  #refine dependency from AccelerateSequence to UseCases::Driving::Accelerate;
  #refine dependency from BrakeSequence to UseCases::Driving::Brake;
  #refine dependency from EmergencyStopSequence to UseCases::Driving::EmergencyStop;
  #refine dependency from TurnLeftSequence to UseCases::Driving::TurnLeft;
  #refine dependency from TurnRightSequence to UseCases::Driving::TurnRight;
  #refine dependency from CleanWindshieldSequence to UseCases::Driving::CleanWindshield;
  #refine dependency from ToggleHeadlightsSequence to UseCases::Driving::ToggleHeadlights;
  #refine dependency from ParkSequence to UseCases::Driving::Park;
  #refine dependency from DriveSequence to UseCases::Driving::Drive;
}
