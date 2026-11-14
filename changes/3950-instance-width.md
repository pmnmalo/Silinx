In short:

- **An instance's Width:** a project module's instance has a Width in its Properties: 8 makes it an array of 8 copies,
  `r(7:0)`, drawn as one (`REG1bit ×8`, its sliced pins buses `D(7:0)`, `Q(7:0)`).

In detail:

- **An arrayed instance made with its Width (#3950):** the Width field of a module instance's Properties rewrites its
  name with the range (`r` → `r(7:0)` for 8, back to `r` for 1), the name its one source (a rename with a range sets
  the field); a width not a whole number from 1 to 1024 an error in the console; undone with Undo
  (core/sch-array.js `withArrayWidth`, `arrayWidth`). Its symbol is drawn as the array (`arrayedDef`): the module's
  name with its copies, a pin sliced over the copies a bus pin of N × w bits (its thick lead, its width, its name with
  its range when it fits), a pin on a net of its own width shared by the copies and drawn as it is, an open one a bus.
  The MCP server's `place_instance` takes a `width`, and `set_instance_width` does what the field does.
