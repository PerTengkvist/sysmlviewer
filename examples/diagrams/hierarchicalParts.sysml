package HierarchicalPartsPkg {

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
    
    
    view def HierarchicalPartsView : GeneralView {
        expose PartDefinitions;
    }

    view def FD1View : GeneralView {
        expose PartDefinitions::FD1;
    }

    view def FD2View : GeneralView {
        expose PartDefinitions::FD2;
    }

    view def FD3View : GeneralView {
        expose PartDefinitions::FD3;
    }
}
