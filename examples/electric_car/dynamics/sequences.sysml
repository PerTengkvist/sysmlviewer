package Dynamics {
  doc /* Sequence diagrams for the use cases. Each interaction is one use case: who asks, which controller decides, and which logical part responds. Lifelines are roles in the scenario, not a second architecture. */

  interaction def UnlockSequence {
    doc /* Unlock. The driver presents a credential, access control authenticates it, and the door locks release. */
    lifeline Driver;
    lifeline KeyFob;
    lifeline AccessController;
    lifeline DoorLocks;
    message presentCredential from Driver to KeyFob;
    then message verifyCredential from KeyFob to AccessController;
    then message releaseLatches from AccessController to DoorLocks;
    then message confirmUnlocked from DoorLocks to Driver;
  }

  interaction def LockSequence {
    doc /* Lock. The driver requests lock, the latches engage, and the car confirms it is locked. */
    lifeline Driver;
    lifeline AccessController;
    lifeline DoorLocks;
    message requestLock from Driver to AccessController;
    then message engageLatches from AccessController to DoorLocks;
    then message confirmLocked from DoorLocks to Driver;
  }

  interaction def ChangeGearSequence {
    doc /* Change gear. The driver moves the gear stick and the maneuvrability controller sets the motor mode. */
    lifeline Driver;
    lifeline GearStick;
    lifeline ManeuvrabilityController;
    lifeline TractionMotor;
    message selectDrive from Driver to GearStick;
    then message modeRequest from GearStick to ManeuvrabilityController;
    then message setMode from ManeuvrabilityController to TractionMotor;
  }

  interaction def TurnLeftSequence {
    doc /* Turn left. Steering-wheel angle becomes a wheel angle through the maneuvrability controller. */
    lifeline Driver;
    lifeline SteeringWheel;
    lifeline ManeuvrabilityController;
    lifeline FrontWheels;
    message turnLeft from Driver to SteeringWheel;
    then message steeringAngle from SteeringWheel to ManeuvrabilityController;
    then message applyAngle from ManeuvrabilityController to FrontWheels;
  }

  interaction def TurnRightSequence {
    doc /* Turn right. Same path as turn left, with the opposite angle. */
    lifeline Driver;
    lifeline SteeringWheel;
    lifeline ManeuvrabilityController;
    lifeline FrontWheels;
    message turnRight from Driver to SteeringWheel;
    then message steeringAngle from SteeringWheel to ManeuvrabilityController;
    then message applyAngle from ManeuvrabilityController to FrontWheels;
  }

  interaction def BrakeSequence {
    doc /* Brake. Pedal force becomes a deceleration request, then regenerative torque and slower wheels. */
    lifeline Driver;
    lifeline BrakePedal;
    lifeline SpeedController;
    lifeline TractionMotor;
    lifeline Wheels;
    message pressPedal from Driver to BrakePedal;
    then message requestDeceleration from BrakePedal to SpeedController;
    then message regenerativeTorque from SpeedController to TractionMotor;
    then message slowWheels from TractionMotor to Wheels;
  }

  interaction def AccelerateSequence {
    doc /* Accelerate. Pedal travel becomes a torque request, the battery supplies power, and the motor drives the wheels. */
    lifeline Driver;
    lifeline AcceleratorPedal;
    lifeline SpeedController;
    lifeline Battery;
    lifeline TractionMotor;
    message pressPedal from Driver to AcceleratorPedal;
    then message requestTorque from AcceleratorPedal to SpeedController;
    then message dischargePower from SpeedController to Battery;
    then message driveTorque from Battery to TractionMotor;
  }

  interaction def EmergencyStopSequence {
    doc /* Emergency stop. Extends braking: the driver brakes hard and the speed controller commands maximum deceleration. */
    lifeline Driver;
    lifeline BrakePedal;
    lifeline SpeedController;
    lifeline TractionMotor;
    message brakeHard from Driver to BrakePedal;
    then message maximumDeceleration from BrakePedal to SpeedController;
    then message fullRegenAndFriction from SpeedController to TractionMotor;
  }

  interaction def ChargeSequence {
    doc /* Charge. The driver connects the plug, the battery controller starts the session, and the battery reports state of charge. */
    lifeline Driver;
    lifeline ChargeInlet;
    lifeline BatteryController;
    lifeline Battery;
    message connectPlug from Driver to ChargeInlet;
    then message startSession from ChargeInlet to BatteryController;
    then message storeEnergy from BatteryController to Battery;
    then message reportStateOfCharge from Battery to Driver;
  }

  interaction def ParkSequence {
    doc /* Park. The driver selects park, holds the brake, and the car locks. */
    lifeline Driver;
    lifeline GearStick;
    lifeline BrakePedal;
    lifeline AccessController;
    lifeline DoorLocks;
    message selectPark from Driver to GearStick;
    then message holdBrake from Driver to BrakePedal;
    then message requestLock from Driver to AccessController;
    then message engageLatches from AccessController to DoorLocks;
  }

  interaction def AdjustClimateSequence {
    doc /* Adjust climate. The driver sets a temperature and the climate controller drives the HVAC unit. */
    lifeline Driver;
    lifeline ClimateController;
    lifeline HvacUnit;
    message setTemperature from Driver to ClimateController;
    then message commandAirflow from ClimateController to HvacUnit;
    then message supplyAir from HvacUnit to Driver;
  }

  interaction def PlayMediaSequence {
    doc /* Play media. The passenger selects a title and the entertainment controller shows it. */
    lifeline Passenger;
    lifeline EntertainmentController;
    lifeline Display;
    message selectTitle from Passenger to EntertainmentController;
    then message startPlayback from EntertainmentController to Display;
    then message showNowPlaying from Display to Passenger;
  }

  interaction def CleanWindshieldSequence {
    doc /* Clean the windshield. The driver requests a wipe and the mechanism sweeps the glass. */
    lifeline Driver;
    lifeline WiperStalk;
    lifeline WiperMechanism;
    message requestWipe from Driver to WiperStalk;
    then message commandSweep from WiperStalk to WiperMechanism;
    then message clearGlass from WiperMechanism to Driver;
  }

  view def UnlockSequenceView : SequenceView {
    doc /* Sequence for the Unlock use case. */
    expose UnlockSequence;
  }

  view def LockSequenceView : SequenceView {
    doc /* Sequence for the Lock use case. */
    expose LockSequence;
  }

  view def ChangeGearSequenceView : SequenceView {
    doc /* Sequence for the ChangeGear use case. */
    expose ChangeGearSequence;
  }

  view def TurnLeftSequenceView : SequenceView {
    doc /* Sequence for the TurnLeft use case. */
    expose TurnLeftSequence;
  }

  view def TurnRightSequenceView : SequenceView {
    doc /* Sequence for the TurnRight use case. */
    expose TurnRightSequence;
  }

  view def BrakeSequenceView : SequenceView {
    doc /* Sequence for the Brake use case. */
    expose BrakeSequence;
  }

  view def AccelerateSequenceView : SequenceView {
    doc /* Sequence for the Accelerate use case. */
    expose AccelerateSequence;
  }

  view def EmergencyStopSequenceView : SequenceView {
    doc /* Sequence for the EmergencyStop use case. */
    expose EmergencyStopSequence;
  }

  view def ChargeSequenceView : SequenceView {
    doc /* Sequence for the Charge use case. */
    expose ChargeSequence;
  }

  view def ParkSequenceView : SequenceView {
    doc /* Sequence for the Park use case. */
    expose ParkSequence;
  }

  view def AdjustClimateSequenceView : SequenceView {
    doc /* Sequence for the AdjustClimate use case. */
    expose AdjustClimateSequence;
  }

  view def PlayMediaSequenceView : SequenceView {
    doc /* Sequence for the PlayMedia use case. */
    expose PlayMediaSequence;
  }

  view def CleanWindshieldSequenceView : SequenceView {
    doc /* Sequence for the CleanWindshield use case. */
    expose CleanWindshieldSequence;
  }
}
