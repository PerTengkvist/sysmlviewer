package OccurrenceSequences {
  doc /* SysML v2 sequence diagrams: an occurrence def whose parts are the lifelines; messages are drawn in declaration order. */
  metadata def Reply;
  attribute def Greeting;

  part def PartA { event occurrence sent; event occurrence ackReceived; }
  part def PartB { event occurrence received; }
  part def Controller { event occurrence commandReceived; }
  part def Plant {
    part controller : Controller;
    part actuator { event occurrence moved; }
  }
  part partA : PartA;
  part partB : PartB;

  occurrence def SequenceA {
    doc /* Redefinition, the reference example. Part c sends nothing and is not drawn. */
    part a :>> partA;
    part b :>> partB;
    part c;
    message msg from a.sent to b.received;
    #Reply message ack from b to a.ackReceived;
  }

  occurrence def SequenceB {
    doc /* Typed instances: a reference part with an event in its body, and a composite part. A payload type and a message without events. */
    ref part a : PartA { event occurrence ping; }
    part b : PartB;
    message hello of Greeting from a.ping to b.received;
    message bye from b to a;
  }

  occurrence def SequenceC {
    doc /* A context part, feature-chain subsetting with a type, qualified subsetting and a nested end. */
    ref part plant : Plant;
    ref part ctrl : Controller :> plant.controller;
    ref part operator : PartA;
    ref part listener :> OccurrenceSequences::partB;
    message command from operator.sent to ctrl.commandReceived;
    message move from ctrl to plant.actuator.moved;
    message notify from ctrl to listener.received;
  }

  view SequenceAView : SequenceView { expose SequenceA; }
  view SequenceBView : SequenceView { expose SequenceB; }
  view SequenceCView : SequenceView { expose SequenceC; }
}
