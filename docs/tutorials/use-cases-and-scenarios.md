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

## Sequences

An `interaction def` is one scenario drawn as a sequence diagram: lifelines are the participants, messages are the arrows in the order they are written. Chain messages with `then`. An acknowledgement carries the `#reply` keyword and is drawn dashed.

```sysml
interaction def UnlockSequence {
  doc /* Precondition Locked. Postcondition Unlocked. */
  lifeline Driver;
  lifeline keyFob;
  lifeline bodyController;
  lifeline locks;
  message pressUnlock from Driver to keyFob;
  then message credential from keyFob to bodyController;
  then message releaseLatches from bodyController to locks;
  then #reply message indicateUnlocked from locks to Driver;
}

view def UnlockSequenceView : SequenceView {
  expose UnlockSequence;
}
```

Messages are numbered in the diagram in declaration order. Name lifelines after the logical parts that play the roles, so the sequence and the logical architecture read as one model.
