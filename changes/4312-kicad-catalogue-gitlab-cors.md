In short:

- **The KiCad catalogue in the browser's edition:** KiCad's 74xx and 4xxx parts are imported there too, not only
  SparkFun's.

In detail:

- **The KiCad catalogue's KiCad parts with no local server (#4312):** gitlab.com's raw files send no CORS header, so
  the browser's edition fetches them through GitLab's API (`browserUrl` in `core/kicad-catalogue.js`), which serves
  the same files with one; their SHA-256 is checked as before. The local server keeps the catalogue's URLs.
