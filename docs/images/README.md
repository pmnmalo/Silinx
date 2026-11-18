# The documentation's screenshots

Every picture here is made by [scripts/docs-screenshots.mjs](../../scripts/docs-screenshots.mjs), never by hand: it
runs Silinx on a temporary workspace (so no name, path or host of anyone's computer is ever in a picture), opens the
examples and takes each shot at 1280×800, in the light theme, as WebP.

When the interface changes, make them again:

```bash
npm run docs:screenshots
```

or only some of them (`npm run docs:screenshots -- --list` names them all):

```bash
npm run docs:screenshots -- hero emulator-basys2
```

then look at the pictures that changed (`git diff --stat docs/images`) and commit them with the change.

A new picture is a new entry of `SHOTS` in the script: its name, what it shows, its interfaces (`silinx`, `ise`) and
languages (`en`, `pt`), and the steps that bring the app there. `test/docs-images.test.js` checks that every shot's
picture is here, that every picture here is a shot's, that each stays under 150 KB, and that every picture a
document shows exists. The script refuses a shot whose page shows a path of the computer or an e-mail address.
