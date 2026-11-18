In detail:

- **The documentation's screenshots, made by a script (#4499):** `npm run docs:screenshots`
  (`scripts/docs-screenshots.mjs`) drives the app through the examples on the UI tests' harness (a temporary workspace
  and HOME), at 1280×800 in the light theme, and writes each picture to `docs/images/` as WebP: the IDE in both
  interfaces and both languages, New Project, the HDL, schematic, ASM, Boolean algebra and circuit editors, a
  simulation, the Board Emulator on a Basys2, a Nexys3 (its VGA monitor) and an iCEBreaker, and an implementation with
  the Silinx toolchain on a Nexys2 and a Tang Nano 9K. Run again, it brings them up to date; a shot whose page shows a
  path of the computer or an e-mail address is refused. `test/docs-images.test.js` checks that every shot's picture
  is there and every picture is a shot's, that each is WebP under 150 KB, and that every picture a document shows
  exists.
