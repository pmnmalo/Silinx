# Silinx project model

A project is a directory under the workspace (default `~/Silinx-projects`, override with
`SILINX_WORKSPACE`) containing `silinx.json`:

```json
{
  "name": "blinky",
  "version": 1,
  "device": { "family": "spartan3e", "part": "xc3s500e", "package": "fg320", "speed": "-4" },
  "board": "s3e-starter",
  "top": "top",
  "simTop": "tb_top",
  "files": [
    { "path": "src/counter.v",  "lang": "verilog", "role": "design" },
    { "path": "src/top.vhd",    "lang": "vhdl",    "role": "design" },
    { "path": "sim/tb_top.v",   "lang": "verilog", "role": "sim" }
  ],
  "constraints": "constraints/top.ucf",
  "stimuli": { "tb": null },
  "impl": { "optMode": "Speed", "optLevel": 1, "startupClk": "JtagClk" }
}
```

* `role: design` files go to synthesis; `role: sim` files are only used for simulation.
* `synthTool`: `'silinx'` (the Silinx toolchain: Yosys, nextpnr's place & route, Silinx's bitstream),
  `'xst'` (Xilinx ISE 14.7) or `'vivado'` (AMD Vivado, the 7-series devices of the local server: the Artix-7's and the
  Zynq-7000's XC7Z010 / XC7Z020's default, #4680, the Spartan-7's, Kintex-7's and the other Zynq-7000 parts' only one, #3895); without it, the mode of Toolchain Settings.
* `kind`: `"design"` for a design and simulation project (no FPGA: drawings and simulation, no board, no implementation;
  #3891, #4103); absent, an FPGA project.
  Since #5440 it is read as the project's profile (below): `"design"` the Digital Logic profile, absent FPGA.
* `profile` (#5440, roadmap #5416): the node kinds the project's System allows, each containing the one before:
  `"logic"` (Digital Logic: design and circuit nodes), `"fpga"`, `"embedded"` (Embedded / SoC: and microcontrollers),
  `"system"` (System: and terminals) (`core/project-profile.js`). Written only when it is changed and only for
  Embedded / SoC and System: Digital Logic is kept as `kind: "design"`, FPGA as no field, so that an untouched project's
  silinx.json keeps its bytes. A project of a System's profile whose top is no module has its one System document as
  its top, `<name>.sys.json` (`core/system-doc.js`, checked by `core/system-check.js`, #4697), its nodes and links; it has
  no `board`: each FPGA node is a module of the project on a board of its own (`board`, `variant`, its ports' `pins`).
  Widening the profile converts nothing; narrowing it is refused while a node would not be allowed
  (`core/profile-change.js`).
* `topSourceType`: the Top-Level Source Type (#4105): `hdl` (absent too), `sch`, `fsm`, `asm`, `tt`, `petri`, `circuit`,
  `c` or `cpp` (`core/top-types.js`); a design and simulation project's is a drawing's.
* `impl.optMode` and `impl.optLevel`: ISE's Optimization Goal and Effort, and the project's Optimization (#2470):
  `Speed` and 1 **Fast** (one mapping, its critical LUTs made shallower, one placement: a project with none is Fast too), `Area` and 2 **Area** (the
  default of a new project: the smaller of the usual mapping's netlist and Speed's, one placement), `Speed` and 2 **Speed** (every mapping for speed, the state machines of 8 states or more one-hot, the
  fastest kept; several placements, the fastest kept). `Area` at 1, of a project made before, is Area.
* Generated implementation output lives in `<project>/build/` (ISE work dir), bitstream `build/<top>.bit`.

## HTTP API (server/)

All under `/api`. JSON in/out. Errors: `{ error: "message" }` with 4xx/5xx.
A page sends its version (`X-Silinx-Version`); a server of another version answers with its own, and the page offers a
reload (#4754).

| Method | Path | Description |
|---|---|---|
| GET | /projects | list `[{ name, device, top, board, modified }]` |
| POST | /projects | `{ name, template?: 'empty' or an example (GET /templates: gates, breadboard, traffic, blinky, pong, stopwatch, clock, vga, isqrt, uart, micro80, lock), device?, board? }` create |
| GET | /projects/:p | project json + `fileTree` |
| PUT | /projects/:p | replace project json |
| DELETE | /projects/:p | move project to `.trash` inside workspace |
| GET | /projects/:p/file?path=... | raw file text |
| PUT | /projects/:p/file?path=... | write raw text body |
| DELETE | /projects/:p/file?path=... | delete file (and remove from files list) |
| GET | /projects/:p/sources | `[{ path, lang, role, text }]` all HDL sources (for the in-browser compiler) |
| GET | /devices | the parts of every ISE 14.7 WebPACK family, the 7-series families AMD Vivado builds (Artix-7, Spartan-7, Kintex-7, Zynq-7000), the iCE40, ECP5 and Gowin families + boards database (server/devices.js) |
| GET | /toolchain | detected ISE + programmer tools |
| PUT | /toolchain | save toolchain settings (`~/.silinx/config.json`) |
| POST | /projects/:p/implement | `{ steps?: ['synth','translate','map','par','trce','bitgen','prombit'] }` -> `{ job }` |
| GET | /projects/:p/reports | parsed utilization / timing summaries of last run |
| POST | /projects/:p/program | `{ bitfile?, tool?, cable?, board?, position? }` -> `{ job }` (`POST /program` with `project` in the body: its older form, kept, #4754) |
| POST | /projects/:p/prom | `{ op, board?, bitfile?, verify?, reconfigure? }` -> `{ job }` (`POST /prom` with `project`: kept) |
| POST | /projects/:p/editor/open | `{ path?, line? }`: Open in VS Code (`POST /editor/open` with `project`: kept) |
| POST | /import-zip?name= | a project's zip (the body) imported as the project `name` (`/projects/import-zip`: kept) |
| POST | /import-xise | `{ name, xise, files }` (`/projects/import-xise`: kept) |
| POST | /projects/:p/merge | `{ zip (base64), resolve?, label? }`: Merge Contribution… (the zip as the body with `?label=` and `X-Silinx-Resolve`: kept) |
| GET | /projects/:p/versions | `{ versions }`: the project's versions, newest first (#5740) |
| POST | /projects/:p/versions | `{ label?, author?, reason? }` -> `{ version, saved }`: Save Version… (`reason`: `manual`, or `before-…` before one of the page's risky commands) |
| GET | /projects/:p/versions/:id | `{ version, json, files }`: a version's project |
| GET | /projects/:p/versions/:id/diff | `{ version, files: [{ path, state }], json }`: what differs between a version and the project now (#5741) |
| POST | /projects/:p/versions/:id/restore | `{ path?, author? }` -> `{ written, removed, json, version, before }`: the whole project or one file restored, the project before it kept as a version |
| POST | /jtag/scan | `{ tool?, cable? }` -> `{ job }` |
| GET | /jobs/:id?since=N | `{ id, kind, status:'running'|'ok'|'error', lines:[...since N], next, result }` |

Jobs are implemented in `server/jobs.js`.
