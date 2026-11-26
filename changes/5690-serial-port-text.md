In detail:

- **One portText (#5690):** `core/serial-line.js`'s Web Serial port text is `serialPortText`, so no module defines
  `core/util.js`'s `portText` again (`test/util.test.js`'s one-copy rule, #1406).
