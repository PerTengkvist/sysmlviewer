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

  part def System {
    part baseEng : Base;
    part eng : Base redefines baseEng;
    part child : Base subsets baseEng;
    part logical : Base;
    part physical : Base;
    attribute temp : Real = 20.0;
    attribute reading : Real = 20.0;

    connection wire connect logical.pout to physical.pin;
    dependency uses from logical to physical;
    dependency multiDep from logical to physical, baseEng;
    allocate logical to physical;
    bind temp = reading;
    flow power from logical.pout to physical.pin;
  }

  view def RelationshipsView : GeneralView {
    expose System;
  }
}
