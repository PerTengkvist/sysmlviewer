package HierarchicalPartsPkg {
    doc /* Diagram examples for hierarchical parts and nested ports. PartDefinitions shows nested function domains. NestedPorts shows serviceA/client with conjugated hierarchical sPort joined by LayeredInterface. */

    package PartDefinitions {
        #functionDomain part FD1 {
            #function part F1;
            #function part F2;
            #function part F3;

            dependency from F1 to F2;
            dependency from F2 to F3;
            dependency from F3 to F1;
        }

        #functionDomain part FD2 {
            #function part F4;
            #function part F5;
            #function part F6;

            dependency from F4 to F5;
            dependency from F5 to F6;
            dependency from F6 to F4;
        }

        #functionDomain part FD3 {
            #function part F7;
            #function part F8;
            #function part F9;

            dependency from F7 to F8;
            dependency from F8 to F9;
            dependency from F9 to F7;
        }

        dependency from FD1 to FD2;
        dependency from FD2 to FD3;
        dependency from FD3 to FD1;
    }

    package NestedPorts {
        doc /* Service/client hierarchical ports. serviceA exposes sPort with nested sP1/sP2, bound inward to children s1/s2. client exposes the conjugated ~sPort and binds nested ends to c1.cP1 / c2.cP2 (conjugated leaf types). LayeredInterface joins the composite faces serviceA.sPort to client.sPort. */

        port def sP1 {
            doc /* Service-side leaf of the first layer. */;
        }

        port def sP2 {
            doc /* Service-side leaf of the second layer. */;
        }

        port def sPort {
            doc /* Composite service face. Nested sP1 and sP2 expand onto every usage; the client uses the conjugated type ~sPort. */;
            port sP1 : sP1 {
                doc /* Nested first-layer end of sPort. */;
            }
            port sP2 : sP2 {
                doc /* Nested second-layer end of sPort. */;
            }
        }

        interface def LayeredInterface {
            doc /* Joins a service sPort to a client ~sPort as one hierarchical connection. */;
        }

        part def S1 {
            doc /* Service child for layer 1. */;
            port sP1 : sP1 {
                doc /* Bound to serviceA.sPort.sP1. */;
            }
        }

        part def S2 {
            doc /* Service child for layer 2. */;
            port sP2 : sP2 {
                doc /* Bound to serviceA.sPort.sP2. */;
            }
        }

        part def C1 {
            doc /* Client child for layer 1. */;
            port cP1 : ~sP1 {
                doc /* Conjugated counterpart of sP1; bound to client.sPort.sP1. */;
            }
        }

        part def C2 {
            doc /* Client child for layer 2. */;
            port cP2 : ~sP2 {
                doc /* Conjugated counterpart of sP2; bound to client.sPort.sP2. */;
            }
        }

        part def ServiceA {
            doc /* Service assembly: hierarchical sPort proxied into s1/s2. */;
            port sPort : sPort {
                doc /* Provided hierarchical face. */;
            }
            part s1 : S1;
            part s2 : S2;
            bind sPort.sP1 = s1.sP1;
            bind sPort.sP2 = s2.sP2;
        }

        part def Client {
            doc /* Client assembly: conjugated ~sPort proxied into c1/c2. */;
            port sPort : ~sPort {
                doc /* Required hierarchical face (conjugated sPort). */;
            }
            part c1 : C1;
            part c2 : C2;
            bind sPort.sP1 = c1.cP1;
            bind sPort.sP2 = c2.cP2;
        }

    }
    package NestedPortsExample {

        part serviceA : ServiceA {
            doc /* Service usage. */;
        }
        part client : Client {
            doc /* Client usage. */;
        }

        interface layered : LayeredInterface connect serviceA.sPort to client.sPort;
    }

    view HierarchicalPartsView : GeneralView;
    view FD1View : GeneralView;
    view FD2View : GeneralView;
    view FD3View : GeneralView;
    view NestedPortsView : GeneralView;
    view HierarchicalPartsView {
        expose PartDefinitions;
    }

    view FD1View {
        expose PartDefinitions::FD1;
    }

    view FD2View {
        expose PartDefinitions::FD2;
    }

    view FD3View {
        expose PartDefinitions::FD3;
    }

    view NestedPortsView {
        expose NestedPortsExample;
    }

    // `::*` exposes only the direct members of PartDefinitions (FD1-FD3,
    // without their functions); `::**` exposes everything under it at any
    // depth, whatever the diagram levels are set to.
    view PartDefinitionsMembersView : GeneralView {
        expose PartDefinitions::*;
    }

    view PartDefinitionsAllView : GeneralView {
        expose PartDefinitions::**;
    }
}

