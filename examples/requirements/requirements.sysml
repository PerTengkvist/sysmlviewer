package RequirementsExample {
  requirement def SomeDef;

  requirement def <'R-01'> Safety {
    doc /* System must shut down safely under fault conditions */
  }

  requirement def Story {
    attribute Type = "UserStory";
    doc /* As a user I want clear status so that I can act */
  }

  requirement functional : SomeDef {
    attribute Type = "Functional";
  }

  requirement def Parent {
    requirement child {
      doc /* Nested child requirement */
    }
  }
}
