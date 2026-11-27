In detail:

- **One board resolver (#5092):** the page's `projectBoard` (web/js/app.js) is core's `projectBoardOf` (core/devices.js)
  on `/api/devices`'s list, built on `resolveBoard`, which takes the list and the fallback of a part of no variant
  (`'first'`, as before, or the page's `'default'`: the default variant, else the board's own device). The page keeps
  its board on every board and variant; a part written in capitals now finds its variant, as core's did.
