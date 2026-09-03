package PartRelationships {
  attribute def Real;
  attribute def String;

  part def Base {
    attribute capacity : Real = 1.0;
    port pout;
    port pin;
  }

  part def Small :> Base {
    attribute capacity : Real = 0.5;
  }

  part def Aggregator {
    part sharedEng : Base;
  }

  part def System {
    part baseEng : Base;
    #function part eng : Base :>> baseEng;
    #function part child : Base :> baseEng;
    #function part logical : Base;
    #function part physical : Base;
    ref part sharedEng : Base[0..*] :> Aggregator::sharedEng;
    attribute temp : Real = 20.0;
    attribute reading : Real = 20.0;

    connection wire connect logical.pout to physical.pin;
    #uses dependency from logical to physical;
    #multi dependency from logical to physical, baseEng;
    allocate logical to physical;
    bind temp = reading;
    flow power from logical.pout to physical.pin;
  }

  view def RelationshipsView : GeneralView {
    expose System;
  }
}
