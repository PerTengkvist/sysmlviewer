package TreeExample {
  part def Vehicle {
    part engine {
      part piston;
    }
    part battery;
    part cabin {
      part seat;
    }
  }

  view VehicleTree : TreeView {
    expose Vehicle;
  }

  view PackageTree : TreeView {
    expose TreeExample;
  }
}
