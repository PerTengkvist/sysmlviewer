# Use Cases and Scenarios

SysML v2 use cases are **cases**: required behaviour of a subject with actors, aimed at an observable result (the objective). There is no separate `Scenario` metaclass. Behaviour is written as a flow of actions, messages, and control (`first` / `then`, `decide`, `merge`, `done`).

**`include use case`** only includes another use case. Optional or shared steps that are not use cases are composed with **`perform`**.

## Self-contained use case

All flow lives inside the use case:

```sysml
use case def ProvideTransportation {
  subject vehicle : Vehicle;
  actor driver : Person;
  objective {
    doc /* Transport driver from start to end. */
  }
  first start;
  then action enterVehicle;
  then action drive;
  then action exitVehicle;
  then done;
}
```

## Use case with CaseScenario or Action

A high-level use case can `perform` smaller units. A **CaseScenario** is a `case` definition used for scenario slices (subject + objective + flow). An **Action** is a plain activity flow without case parameters.

```sysml
case def CaseScenario {
  subject system;
}

case scenarioA : CaseScenario {
  first start;
  then action doA;
  then done;
}

use case def Operate {
  subject mySubject : System;
  objective {
    doc /* Observable result for the user. */
  }
  first start;
  then perform scenarioA { in system = mySubject; }
  then if chooseC then { perform scenarioC { in system = mySubject; } }
       else { perform scenarioD { in system = mySubject; } }
  then done;
}
```

Bind the subject (and actors when needed) on each `perform`. `include` does not apply between ordinary cases.

### CaseScenario in SysML Viewer

Double-click a use case to open the detail dialog. The right-hand canvas shows the top-down flow. **CaseScenario** steps can be expanded inline. An **Action** performed from the use case is **not** expanded there; open it as its own action-flow diagram.

## Action as a scenario

An action owns an activity diagram (start, actions, decide/merge, done):

```sysml
action chargeSequence {
  first start;
  then action plugIn;
  then decide ready;
    if ok then charge;
    else abort;
  merge after;
  then done;
}
```

Call it from a use case with `then perform chargeSequence;`. In the viewer it opens as a separate diagram.

## Realizing a use case

A use case is a black box: its steps say what the system does for the actor. A function realizes it from the inside. Write one link by hand, a `#refine` from a function step to the use case step it carries out, and the viewer derives the rest: the function, the function nodes that perform the step and the logical parts they are allocated to.

An actor that performs a step is written in the use case, `actor Driver { perform pressStart; }`. The other steps are system steps, and those are the ones a function has to realize.

[//]: # (realization-snippet)
```sysml
package Realize {
  package UC {
    use case def <'UC001'> StartVehicle {
      actor Driver { perform pressStart; }
      action pressStart;
      action checkKey;
      action showReady;
    }
  }
  package Functions {
    part def Security {
      part authenticate { perform startFlow.checkKeyInCabin; }
      part indicate { perform startFlow.releaseImmobilizer; }
      action startFlow {
        action checkKeyInCabin;
        action releaseImmobilizer;
        first start;
        then checkKeyInCabin;
        then releaseImmobilizer;
        then done;
      }
    }
  }
  package Logical { part vehicleController; }
  allocate Functions::Security::authenticate to Logical::vehicleController;
  allocate Functions::Security::indicate to Logical::vehicleController;
  #refine dependency from Functions::Security::startFlow::checkKeyInCabin
                       to UC::StartVehicle::checkKey;
  #refine dependency from Functions::Security::startFlow::releaseImmobilizer
                       to UC::StartVehicle::showReady;
}
```

In `examples/electric_car` every use case is written this way. StartVehicle marks the driver's step, and its other steps are system steps:

[//]: # (source: examples/electric_car/use_cases/use_cases.sysml)
```sysml
use case def <'UC001'> StartVehicle {
  actor Driver { perform pressStart; }
  objective Requirements::PowerModes;
  objective Requirements::Immobilizer;
  // ...
}
```

A step may be realized by steps of more than one function, and a function step that reads the actor's input refines the actor's step:

[//]: # (source: examples/electric_car/functions/functions.sysml)
```sysml
#refine dependency from Functions::Security::startFlow::readStartRequest to UseCases::Driving::StartVehicle::pressStart;
#refine dependency from Functions::Security::startFlow::checkKeyInCabin to UseCases::Driving::StartVehicle::checkKey;
#refine dependency from Functions::Security::startFlow::releaseImmobilizer to UseCases::Driving::StartVehicle::showReady;
#refine dependency from Functions::Security::startFlow::switchOnHighVoltage to UseCases::Driving::StartVehicle::showReady;
#refine dependency from Functions::Security::startFlow::enableDrive to UseCases::Driving::StartVehicle::showReady;
#refine dependency from Functions::DriverFeedback::powerModeFlow::showPowerMode to UseCases::Driving::StartVehicle::showReady;
```

Roles come from the relations, not from names: a function is a part that owns an action flow, a function node is a part that performs one of its steps, and a logical part is the target of the node's `allocate`. A `#refine` from a function or a function node straight to a use case still works, and so does one from a whole flow (a coarse link). The most precise link wins, and a function (node) that refines a use case directly counts the same in failure and FMEA reports as one found through the steps.

Three views show the result, all in `examples/diagrams/use_case_realization.sysml`: a `GridView` that exposes use cases is the traceability matrix, an `AllocationView` on a use case or a function draws the chain as four columns, and an `ActionFlowView` on a use case (`view StartRealization : ActionFlowView { expose UseCaseRealization::UC::Start; }`) draws the activity on swimlanes, in black box, white box or logical lanes.

A use case with at least one step link is checked. `scripts/check_sysml.py` then reports system steps nobody realizes (`unrealized-system-step`), steps in a linked flow that refine nothing (`untraced-function-step`) and links with a wrong end (`bad-realization-end`, for example a function node that refines a use case step). Use cases without step links are not checked.

## Sequences

A scenario drawn as a sequence diagram is an `occurrence def`. It describes the system while it runs, so its lifelines are not declared as such: a lifeline is a part of the occurrence, an instance, that a message uses as an end. The messages are the arrows, drawn in the order they are written (no `first` or `then` is needed). An acknowledgement carries the `#Reply` keyword, defined once with `metadata def Reply;`, and is drawn dashed.

The main form types each lifeline with the part definition it is an instance of. Use `ref part` for a participant that exists outside the scenario (the parts of the system, the actors) and `part` for one that only lives within it, such as a charging session.

[//]: # (source: examples/electric_car/dynamics/sequences.sysml)
```sysml
metadata def Reply;

part def Driver {
  doc /* The person driving. Plays the Driver actor of the use cases in the sequences. */
}

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
```

`KeyFob`, `VehicleController` and the other types are part definitions in `LogicalArchitecture::Types`, one for each part of `Car`, and `Car` types its parts with them (`part keyFob : Types::KeyFob`). Name each lifeline like the logical part it stands for, so that the sequence and the logical architecture read as one model. Parts that no message uses as an end are not drawn.

A view exposes the occurrence def, as it does for any other diagram:

```sysml
view UnlockSequenceView : SequenceView {
  expose UnlockSequence;
}
```

### Other ways to declare a lifeline

A lifeline can also point at a feature of a larger context instead of a type of its own. `examples/diagrams/occurrence_sequences.sysml` shows every form. In short, with `keyFob` as a feature chain and `car.locks` as a nested end:

```sysml
part def Driver { event occurrence presses; }
part def KeyFob { event occurrence pressed; }
part def Car { part keyFob : KeyFob; part locks; }

occurrence def Forms {
  ref part car : Car;
  ref part keyFob :> car.keyFob;
  ref part driver : Driver;
  message press from driver.presses to keyFob.pressed;
  message unlock from keyFob to car.locks;
}
```

- **Feature chain.** Declare the context once and subset its feature: `ref part car : Car;` and `ref part keyFob :> car.keyFob;`. The lifeline then is the usage `Car::keyFob`, not just something of the same type.
- **Redefinition.** `part a :>> partA;` redefines a feature that the occurrence def inherits or can see.
- **Type and subsetting.** `ref part ctrl : Controller :> plant.controller;` gives both.
- **Nested ends.** With `ref part car : Car;` a message may go `from car.keyFob to car.vehicleController`. The viewer then draws the nested parts as lifelines, with ids such as `<occurrence>::car::keyFob`.

### Events

A message goes between two event occurrences. Declare them in the part definitions and name them in the ends. This is the reference example, in standard SysML v2:

```sysml
part def PartA { event occurrence sent; }
part def PartB { event occurrence received; }
part partA : PartA;
part partB : PartB;
occurrence def SequenceA {
  part a :>> partA;
  part b :>> partB;
  message msg from a.sent to b.received;
}
```

The viewer draws the message between the two parts. An end without an event (`from a to b`) is fine, and an event that cannot be found gives a warning and is drawn on the part. The electric car does not use events.

The older dialect `interaction def` with `lifeline x;` and `message payload from A to B` still works and is drawn the same way.
