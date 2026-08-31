package hbox {
  port def EventPort {
    in item rcvEvent : Event;
    out item sndEvent : Event;
  }
  
  part def HBox {
    part BoxA {
      port event : EventPort;
      attribute eventlog : List;
      attribute status : String;
    }
    part BoxB {
      port event : EventPort;
      attribute eventlog : List;
      attribute status : String;
    }
    part BoxC {
      port event : EventPort;
      attribute eventlog : List;
      attribute status : String;
    }
    part EventBroker {
      port event : EventPort;
      attribute eventlog : List;
    }
    port event : EventPort;
    attribute eventlog : List;
    attribute status : String;
    connection conn1 connect EventBroker.event to event;
    connection conn2 connect BoxB.event to EventBroker.event;
    connection conn3 connect BoxC.event to EventBroker.event;
    connection conn4 connect BoxA.event to EventBroker.event;
  }
  
  interaction def EventInteraction : Interaction {
      lifeline BoxA;
      lifeline BoxB;
      lifeline BoxC;
      lifeline EventBroker;
      message BoxA.event from BoxA to EventBroker;
      then message BoxA.event from EventBroker to BoxB;
    }

  view def HBoxView : GeneralView {
      expose HBox;
      filter @status or @eventlog;
  }
  view def HBoxEventView : SequenceView {
    expose EventInteraction;
  }

  attribute def Bytes;
  attribute def Integer;
  attribute def List;
  attribute def Real;
  attribute def String;
}
