In short:

- With no project open, the side panel shows its Start page only, without the row of tabs (Start, Design, Files,
  Libraries, Teaching, Collaboration); they come back when a project opens.

In detail:

- **No side panel tabs with no project (#4257):** with no project open, the side panel's tab row is hidden in both
  interfaces (`<html data-no-project>`, set with the project's kind flag), and the Start page (New Project…, Open
  Project…, Open from Repository…, the recent projects) is all it shows. On a narrow screen the Silinx interface's
  activity bar goes too: the drawer opens from the header's button, the Start page from the window's edge. A project
  opened brings the tabs back, on the tab last chosen where nothing else picks one (the Silinx interface opens on its
  Design page, #1171), and closing it hides them again; in the server editions and the browser edition, for a design
  and simulation project as for an FPGA one.
