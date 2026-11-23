In detail:

- **The menus' UI test waits for each command to finish or show its dialog (#5230):** a menu item whose dialog comes
  after a module's or the server's answer (Share Project…, Open from GitHub Repository…, Rename Project…) could open
  it after the test had looked for dialogs and moved on, and it covered the next menu ("its title is not under its own
  position (covered by div.dlg-overlay)"). The page counts the commands not finished yet (window.Silinx.actions,
  web/js/state-proc.js, set by app.js's action runner), and test/ui/app.test.js's settle waits for none, or a dialog.
