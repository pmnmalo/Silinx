In detail:

- **A port named after a resource by its number (#5765):** `boardAutoAssign` matches a one-bit port named after a
  resource of several pins and an index (`btn3`, `btn_3`, `led0`, `sw7`, `an2`) to that pin of the resource, as `btn(3)`
  of a bus would have it; an index the resource has not stays unmatched, as before.
