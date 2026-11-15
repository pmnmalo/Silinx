In short:

- **Following the owner's Board Emulator:** a viewer's own Board Emulator gets the owner's switches and buttons, power,
  run and clock rate, so its LEDs and displays follow. Clicking on it yourself is browsing alone. The sharing windows
  now say what a viewer follows: the owner's documents, views, simulations, emulators and runs.

In detail:

- **The owner's Board Emulators (part 4 of #4002, core/collab-emu.js, web/js/collab-emu.js):** the last channel of the
  owner's activity, `emu`, gives each open emulator (at most 4) its board's switches and buttons, on or not, in the
  board's order, its power, whether it runs, and its clock's rate. It is sent at once when the owner presses or lets go
  of one, so a short press is not missed. The viewer's page gives its own emulator of the same design the same power,
  inputs, rate and run through the board's own controls (a switch clicked, a button kept pressed or let go as
  Shift+click does, the clock's list); its time is its own, and the design's outputs follow the inputs. A click on the
  viewer's board or its toolbar is browsing alone. The emulator's API gives its inputs, whether it runs and its rate.
- **The sharing windows (#4002):** Share Project…'s live window, Add a User…'s viewer note and the follow window say
  what a viewer follows: the files and drawings, and the owner's documents, views, selection, simulations, emulators
  and runs; of the builds, only the reports the owner opens. In Portuguese too. README and SECURITY.md describe the
  owner's activity.
- **MCP (#4002):** `follow_project` gives the owner's Board Emulators (`ownerActivity.emu`, and a line for each in its
  text: powered or not, running and its rate, the switches and buttons on).
