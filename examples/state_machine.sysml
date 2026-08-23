package StateExample {
  state def DoorMachine {
    state Closed;
    state Open;
    state Locked;
    transition unlock from Locked to Closed;
    transition open from Closed to Open;
    transition close from Open to Closed;
    transition lock from Closed to Locked;
  }

  view def DoorStateView : StateTransitionView {
    expose DoorMachine;
  }
}
