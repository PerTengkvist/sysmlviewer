package Lib {
  package Sub { part p; part P; }
  part hub;
  part q;
  part def Box { port out; }
}
package Other {
  part def Box { port wrong; }
  part q;
}
