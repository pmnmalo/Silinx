# Developing Silinx

Running Silinx from its source, its command line, the standalone edition and the repository's layout. To
contribute, read [CONTRIBUTING.md](../CONTRIBUTING.md) first.

```bash
git clone https://github.com/pmnmalo/Silinx.git && cd Silinx
npm install
npm start          # prints the address to open, http://127.0.0.1:8642/#token=…  (node bin/silinx.js serve --open opens it)
```

How Silinx is built: [docs/ARCHITECTURE.md](ARCHITECTURE.md), the application as a whole, and
[docs/TOOLCHAIN.md](TOOLCHAIN.md), the toolchain from the design to the `.bit`.

To contribute, read [CONTRIBUTING.md](../CONTRIBUTING.md): the project's development principles (issues,
tests, integration) are in [CLAUDE.md](../CLAUDE.md), for people and AI agents alike.
Security: report a vulnerability privately, as [SECURITY.md](../SECURITY.md) says (it also lists what is
in scope and what the project does to protect its users).

The server listens on this computer only (`127.0.0.1`), and answers only the browser that has its token: it
makes one at every start and prints the address with it (`…/#token=…`); the launchers and `--open` open it with a
one-time code instead (`…/#code=…`, which the page exchanges for the token: no token on a command line, #2955);
the page keeps it, so the plain address works afterwards in the same browser (#2564). Another user of the
same computer has no token. With `serve --host 0.0.0.0` (or another address) other computers can reach it:
it then prints a warning, and the address with the token is the only way they can use it. It then needs a certificate
and its key (`--tls-cert cert.pem --tls-key key.pem`: HTTPS), or `--insecure-http` to accept plain HTTP, where the
token crosses the network unencrypted (#4739); a page of another port or subdomain of the same site is refused as
another site's (`Sec-Fetch-Site: same-site`). The toolchain settings that run a program
(`docker.command`, `docker.extraArgs`, `ssh.sshArgs`, `ssh.identity`, `paths`) are set in
`~/.silinx/config.json` only, never from the page; so is an absolute `ssh.remoteDir` (from the page, a folder
inside the remote home, #2958).

Projects live in `~/Silinx-projects` (override with `SILINX_WORKSPACE`). Pushing a tag `vX.Y.Z`
publishes a release with the files above (`.github/workflows/release.yml`), once CI, which the tag
starts, has passed on the tagged commit (`scripts/wait-for-ci.mjs`). CI runs at a release, and nightly on main
when it changed (#3423), not on pushes to main (#607); a pull request runs the test files of the modules it changes (`.github/workflows/pr-tests.yml`, #637).
The tests against ISE (`test/ise/`) run nightly, and on demand (Actions ▸ ISE ▸ Run workflow), on
a self-hosted runner with the ISE Docker image (label `ise`, `.github/workflows/ise.yml`); only code
already on main runs there, never a pull request's: the runner refuses every other job before its
first step, is on line only while those workflows need it, and runs as a user of its own with no keys
or tokens (`scripts/ise-runner/`). The same runner compares the Silinx toolchain
with ISE on the design corpus every week (`.github/workflows/quality.yml`) and pushes the results
([docs/QUALITY.md](QUALITY.md)) to the branch `quality-results`, merged into main by a maintainer. The scheduled runs (nightly, ISE, weekly comparison) are skipped when
main has not changed since their last successful run, documentation aside
(`scripts/changed-since-last-run.mjs`); run by hand, they always run.

## Command line

```bash
node bin/silinx.js check <projectDir>                           # parse + elaborate the top
node bin/silinx.js sim   <projectDir> --time 2000 --vcd out.vcd   # simulate the simulation top
node bin/silinx.js ucf   <projectDir> --board basys2              # constraints from a board's pin table
node bin/silinx.js toolchain [--docker xilinx/ise:14.7]          # show / set the ISE toolchain
node bin/silinx.js mcp                                         # an MCP server for an AI assistant (below)
node bin/silinx.js grade <exercise.json> <submissions…> --csv grades.csv   # grade exercises (docs/GRADING.md)
node bin/silinx.js classroom template|grade …                  # GitHub Classroom assignments (docs/CLASSROOM.md)
npm test                                                         # test suite
SILINX_ISE_TESTS=1 npm run test:ise                              # the real ISE flow (Docker image; SILINX_ISE_HOST=user@host: on another machine)
SILINX_ISE_HOST=user@host npm run check:open-flow [projects…]   # the open flow vs ISE: DRC, byte-identical bitstreams (SILINX_ISE_HOST=local: the image here)
npm run check:xc7 [-- --boards basys3 --filter '^pong$' --vivado]   # the 7-series' open flow: frames, round trip, pins (--vivado: Vivado's DRC, timing, write_cfgmem)
node scripts/check-private-data.mjs [--history]                 # no personal data, secrets or Xilinx files (also run by npm test)
npm run test:ui                                                  # UI tests (headless Chrome), incl. memory leaks (npm ci first)
node --test --test-name-pattern='latch warning' test/ui/hints.test.js   # one UI test alone
npx playwright install webkit && npm run test:webkit             # memory in WebKit (Safari's engine)
npx playwright install firefox webkit && npm run test:browsers   # the main UI flows in Firefox and WebKit
SILINX_UI_BROWSER=firefox npm run test:ui                        # any UI test in firefox, webkit or chromium
node scripts/collab-latency.mjs [--rtt 0,20,80] [--pace before] [--webrtc]   # a shared project's latency, owner to follower, by path (#4647)
npm run test:release                                             # the release zip as users get it (see below)
node scripts/package-release.mjs [version]                       # the release files into out/ (as release.yml)
```

`grade` and `classroom grade` with `--json` write the class's results, which the Exercise document's *Class Results…*
(its ⋮ menu) opens: each test's rate of Accepted, the weakest first, each student's verdicts, *Export CSV* (#3864,
[docs/GRADING.md](user/en/grading.md)).

`npm run test:release` builds `silinx-<version>.zip` with the release script, unzips it into a
clean folder, checks its contents (production dependencies only, Yosys's WebAssembly, licence and
notices, executable launchers) and size, starts it with its own launcher (`PORT` and
`SILINX_NO_BROWSER=1` are honoured by the launchers) and runs *Synthesize - Yosys (open)* on the
blinky example in headless Chrome, with every request to another host refused and reported (the
app must work offline; the update check at start-up is the only one allowed). CI runs the unit
tests and a UI smoke test on Linux, macOS and Windows (the toolchain's heaviest tests on Linux only), the release zip test, and the main UI flows
in Firefox and WebKit.

## Standalone edition (a single HTML file)

```bash
npm run build:standalone    # writes dist/Silinx.html (~5 MB)
```

One file, no server: open it in a browser or share it. It includes the editor, schematics, ASM
editor, simulation/SSim, pin planner and ISE project import/export; the examples (*gates*, *breadboard*, *traffic*,
*blinky*, *pong*, *stopwatch*, *clock*, *vga*, *isqrt*, *uart*, *micro80*) are embedded. Projects are stored in the browser (*File ▸ Export Project (.zip)…* / *Import Project…* to move
them), or, in Chrome / Edge, in a folder on the disk (*File ▸ Open Workspace Folder…*: the File
System Access API; each project a folder as the full application writes it, so the same folder opens
there; web/js/project-store.js). `--site <dir>` also writes the GitHub Pages site: the page and its `assets/` (the device
descriptions, the bit database and Yosys in WebAssembly, ~115 MB), with which the site runs the
Silinx toolchain in the browser: *Implement Design* and *Generate Programming File* for the
Spartan-3E and Spartan-6 boards and the iCE40 (the bitstream is downloaded), and *Configure Target Device* programs the FPGA of
a Basys2 / Nexys2 over WebUSB (Chrome / Edge; core/adept.js, a port of adepttool's Adept USB
protocol), and its Platform Flash (core/xcf.js, the steps of `scripts/xcf_prog.py`), and the iCEBreaker's SPI flash (core/ftdi-ice40.js),
and the FPGA of a Basys 3, a Nexys A7 or a Tang Nano 9K through its FT2232H's (or BL702's) JTAG (core/ftdi-jtag.js, #2298), and a ULX3S's
through its FT231X (core/ft231x-jtag.js). XST (Xilinx ISE)
needs the full application (`npm start`).

## Layout

```
core/       VHDL/Verilog parsers, elaborator, simulator, schematics, ASM, UCF, zip (browser + Node);
            adept.js / xcf.js: the board and its Platform Flash programmed over WebUSB; ftdi-ice40.js /
            ftdi-jtag.js / ft231x-jtag.js: the FTDI boards' (the iCEBreaker's flash, the 7-series', the Gowin's and the ECP5's JTAG)
server/     HTTP server, projects, ISE flow, programmers, boards/devices, .xise
web/        Project Navigator UI (the Silinx and ISE style interfaces, web/css/silinx.css): editor, SSim, schematics, ASM, pin planner, iMPACT
docker/ise/ builder kit for the private Xilinx ISE 14.7 Docker image
scripts/    adepttool installer/patch, Platform Flash programmer, standalone build
examples/   example projects (for the Basys2; each built by the Silinx toolchain on every Basys2, Nexys2, Nexys3, Atlys and
            the iCEBreaker): gates (the first one: logic
            gates drawn as a schematic, a 4-bit prime-number detector with NOT / AND / OR and with NAND gates only),
            breadboard (74LS chips wired on a breadboard, a digital circuit: a counter of a button's presses, its shift register on the LEDs),
            traffic (a pedestrian crossing: a state diagram, a Boolean algebra, VHDL and a Verilog display),
            blinky (VHDL + Verilog, an ASM chart, its steps counted on the display),
            pong (a game for two, Verilog), stopwatch (VHDL, block RAM and multipliers), clock (Verilog, set
            with the buttons), vga (VHDL, a picture on a VGA monitor),
            isqrt (a C function made into hardware by Silinx HLS, on the display),
            uart (VHDL, serial communication with a terminal),
            micro80 (VHDL, a microprocessor, light8080, running a program from block RAM); each with a self-checking testbench
docs/       ARCHITECTURE.md (Silinx's architecture as a whole: the editions, the layers, each part and its
            files), user/ (the user's guide, in English and Portuguese), IR.md (parser intermediate
            representation), PROJECT.md (project model and API), OPEN-TOOLCHAIN.md (how the open
            Spartan-3E toolchain is developed), TOOLCHAIN.md (the toolchain's architecture, from the design to the
            .bit), QUALITY.md (the Silinx toolchain against ISE)
packages/silinx-fpga/
            the Silinx toolchain (Yosys synthesis, the Spartan-6's packing, nextpnr's place and route, timing,
            bitstream); its research/ builds the
            bit database and the device descriptions
research/   synthesis quality, handwriting models, other experiments
test/       node:test suites
```

Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx is not affiliated
with them.

