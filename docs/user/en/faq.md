# Questions and answers

[User's guide](README.md) · English · [Português](../pt/faq.md)

**Do I need to install anything?** No: https://pmnmalo.github.io/Silinx/ does everything in the browser, from the
design to programming the board. Installing it ([Getting started](getting-started.md), way 2) adds the projects as
folders, Xilinx ISE and AMD Vivado, and the installed programming tools.

**Do I need Xilinx ISE?** Not for the Basys2, Nexys2, Nexys3, Atlys, iCEBreaker, ULX3S and Tang Nano 9K boards: the
Silinx toolchain builds for them. ISE 14.7 adds the other boards of its families. See
[Boards and toolchains](boards.md).

**Where are my projects?** In the browser, unless you choose a folder of your disk (*File ▸ Open Workspace Folder…*,
Chrome and Edge). Running Silinx on your computer, in `Silinx-projects` in your user folder. *File ▸ Export Project
(.zip)…* makes a copy.

**Does it work on an iPad or a tablet?** Yes: the editors, the simulation, the emulator and the bitstream. Chrome on
an Android tablet programs the board too; an iPad cannot reach USB devices.

**Can I open my ISE projects?** Yes: *Import Project…* takes an ISE project (its `.xise`, or a zip), its schematics
too.

**What does Silinx send over the Internet?** The site counts its visits and what is used (a new project, a
simulation, a bitstream) with GoatCounter: no cookies, no personal data, never a project's content. The installed
application and the downloaded `Silinx.html` send nothing. The details: [the features](features.md#privacy-and-usage-counts).

**Something does not work.** Tell us on [GitHub](https://github.com/pmnmalo/Silinx/issues): what you did, what you
expected and what happened. Using Silinx in a course? Tell us too, on
[GitHub Discussions](https://github.com/pmnmalo/Silinx/discussions/151).

**Is it free?** Yes: free software, under the AGPL-3.0 licence. Your designs, and the HDL Silinx generates for them,
are yours.
