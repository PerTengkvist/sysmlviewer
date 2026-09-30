package RequirementsExample {
  // Requirements, user stories and mixed structure for Diagrams example.

  requirement def SomeDef;

  requirement def <'R-01'> Safety {
    doc /* System must shut down safely under fault conditions */
  }

  requirement def <'US-01'> ShowStatus {
    attribute Type = "UserStory";
    doc /* As a driver I want clear status so that I can act */
  }

  requirement def <'US-02'> ConfirmAction {
    attribute Type = "UserStory";
    doc /* As an operator I want confirmation before critical actions */
  }

  requirement functional : SomeDef {
    attribute Type = "Functional";
    doc /* Provide power-on self test within 2 seconds */
  }

  requirement def Parent {
    doc /* Top-level capability requirement */
    requirement child {
      doc /* Nested child requirement */
    }
  }

  part def Controller {
    port powerIn;
  }

  interface def PowerBus;

  view def RequirementsGraphView : GeneralView {
    expose RequirementsExample;
  }

  view def RequirementsTableView : GridView {
    expose RequirementsExample;
  }
}
