package Example {
  part def FunctionalModule {
    port powerIn;
  }

  part def Engine {
    port powerIn;
    port statusOut;
  }

  part def Vehicle {
    part engine : Engine;
    part fm1 : FunctionalModule;
    port powerOut;
    port fuelIn;

    connect powerOut to engine.powerIn;
  }
}
