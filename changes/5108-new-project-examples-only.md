In short:

- **New Project:** Start from lists the empty project and the examples only, no more the test designs.

In detail:

- **New Project's Start from: Empty project and the examples only (#5108):** the test designs (#1746) are no
  more in the list, nor their note on the Project Settings page; the MCP server as the interface: `list_examples`
  lists the examples only and `new_project_from_example` makes a project from an example only. The listing of the
  test designs (`/api/test-designs`, `api.testDesigns`) and the browser edition's copy of them go; the test designs
  stay in `test-designs/`, where the tests open them through the server.
