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

  view def VehicleTree : TreeView {
    expose Vehicle;
  }

  view def PackageTree : TreeView {
    expose TreeExample;
  }
}
