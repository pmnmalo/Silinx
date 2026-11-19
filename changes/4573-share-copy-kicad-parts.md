In short:

- Share Project… ▸ A copy makes the link of a project with imported KiCad libraries again: the link carries only the
  parts its drawings use. When no link can be made, the reason is in red above the link's box and in the console.

In detail:

- **A copy's link leaves out the KiCad parts no drawing uses (#4573):** a project whose `parts/` folder held whole
  imported KiCad libraries (hundreds of kilobytes, of which a circuit uses a few symbols) went over the link's 64 000
  characters, so Generate made neither the full link nor the short one, signed in to GitHub or not. The link now
  carries each symbol a drawing uses, the symbols it extends and its footprint (`core/link-parts.js`). A library in one
  `.kicad_sym` file is kept whole, and so is a library that does not read, with every footprint. The files left out
  are said in the console, and by MCP `project_link` (its `parts`).
- **Why there is no link, red and in the console (#4573):** a design too large for a link is said in red above the
  link's box, no longer below it, and as an ERROR in the console. So is a short link that cannot be made (no GitHub
  sign-in or token, GitHub's refusal).
