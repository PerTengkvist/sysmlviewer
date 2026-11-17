package Wildcard {
  private import Lib::*;
  part a;
  dependency from a to Sub::p;
  part box : Box;
}
package Member {
  private import Lib::Sub;
  part a;
  dependency from a to Sub::p;
}
package Inner {
  private import Lib::Sub::*;
  part a;
  dependency from a to p;
}
package Qualified {
  part a;
  dependency from a to Lib::Sub::p;
}
package OwnShadowsImport {
  private import Lib::*;
  part a;
  part hub;
  package Sub { part p; }
  dependency from a to hub;
  dependency from a to Sub::p;
  part def Box { port own; }
  part box : Box;
}
package Unimported {
  part a;
  dependency from a to q;
}
package Ambiguous {
  private import Lib::*;
  private import Other::*;
  part a;
  dependency from a to q;
  part box : Box;
}
package Stray { part onlyHere; }
package NoFallback {
  part a;
  dependency from a to onlyHere;
}
