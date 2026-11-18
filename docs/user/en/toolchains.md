# The toolchains

[User's guide](README.md) · English

The reference: the Silinx toolchain, Xilinx ISE 14.7 and AMD Vivado, and programming the board. In short:
[Boards and toolchains](boards.md).

## Synthesis and bitstreams (Xilinx ISE 14.7)

Implementation uses the Silinx toolchain by default (below), or the ISE 14.7 command-line tools
(WebPACK edition: free, with a free license).

**Without ISE (Silinx toolchain):** the synthesis (*Synthesize - Yosys*, with Silinx as
the project's synthesis tool; *Synthesize - Yosys (open)* in a project that synthesizes with XST)
synthesizes any design with Yosys compiled to WebAssembly, in parallel Web Workers. Its *Optimization* (Process Properties) is **Fast**, **Area** or
**Speed**. Fast maps the design once and Place & Route makes one placement: the quickest build. Area, the default of a
new project, also synthesizes as Speed does and keeps the smaller netlist (by slices, then LUTs), with one placement. Speed tries the mappings for speed, its state machines of 8 states or more one-hot, and keeps the
fastest; Place & Route makes several placements and keeps the fastest (by nextpnr on the Spartan-3E 32 for a design of up to
100 slices, eight up to 500, four up to 2000, two above). On the Spartan-6, Place & Route makes three placements and keeps the fastest at every Optimization. A project made before these three is Fast (its Speed and Normal). ISE gets
them as its Optimization Goal and Effort: Speed / Normal, Area / High and Speed / High. Implement Design and Generate Programming File do not
synthesize again while the synthesis is up to date (the design's sources, top, device and Optimization
unchanged). For the **Basys2-100 and Basys2-250
(XC3S100E / XC3S250E-CP132) and the Nexys2-500 and Nexys2-1200 (XC3S500E / XC3S1200E-FG320)**
Silinx also places and routes (nextpnr) and writes the bitstream: the device descriptions ship with
Silinx, and the bitstreams it writes for the tested designs are byte for byte those ISE's bitgen writes for the same routing (ISE's DRC finds no error in them). The same holds in the
local server for the Spartan-6 boards, the **Nexys3 and the Atlys** (XC6SLX16 / XC6SLX45-CSG324; the Atlys's
seven-segment display and VGA on its VHDCI connector), and in the browser edition (#2103). It is the
default execution mode of a new installation, so students need nothing else for these boards; for
the other boards choose an ISE mode in *Tools ▸ Toolchain Settings ▸ Execution mode*. The
usual processes then run Silinx's own flow on this machine: *Synthesize - Yosys* (Yosys),
*Translate* and *Map* (the netlist and the constraints read, then packed into slices and I/O
sites: by nextpnr on the Spartan-3E, by Silinx on the Spartan-6), *Place & Route* (nextpnr's placement and routing, checked against
the bit database's routing switches, static timing against the UCF's PERIOD constraints), *Generate Programming File* (`build/<top>.bit`, and
`build/<top>_prom.bit` for the PROM), with the same console, process icons, Stop and *Design
Summary* (utilization, timing) as with ISE; *Configure Target Device* programs the board as usual
and *View Implemented Design (FPGA)* shows the routed design; *Back-annotate Pin Locations* adds the
pads the placer chose to the UCF and *View Technology Schematic* draws the netlist of its synthesis
(Yosys's LUTs, flip-flops, carry chains, block RAMs…, by instance of the design); *Generate
Post-Synthesis Simulation Model* writes that netlist as a VHDL model of UNISIM primitives (and in
Verilog), synthesized with the generics the test bench gives the design, for *Simulate
Post-Synthesis Model*; *Generate Post-Translate* and *Post-Map Simulation Model* write, as ISE's
netgen does, models of SIMPRIM primitives in VHDL and Verilog: the translated netlist, and the packed
design with each slice as the elements its configuration uses (LUTs, F5 / FX multiplexers, the carry
chain, flip-flops or latches with their inverters), the pads, clock buffers, block RAMs, multipliers
and DCMs (functional, no timing); *Generate Post-Place & Route Simulation Model* writes the routed
design so, and its timing as an SDF file (`build/netgen/par/<top>_timesim.sdf`: every connection's
delay and every element's, from the static timing, within 1.2 % of ISE's on the same routing), which
*Simulate Post-Place & Route Model* applies (the delays, the glitches a gate filters, the setup
checks reported as timing violations); *Generate Text Power Report* writes an estimate of the design's power
(`build/<top>.pwr`, laid out as XPower's report and said to be an estimate): the device's static
power and the dynamic power of the routed design's clocks, logic, signals and I/Os at the switching
rates of XPower's vectorless estimate, with coefficients fitted to XPower 14.7 on the examples
(there its total is within 10 % of XPower's, its dynamic power alone within 0.35 to 2.2 times;
`node scripts/measure-power.mjs --compare`). No process needs ISE in that mode. Besides logic, carry chains, wide multiplexers and flip-flops it takes block
RAMs, multipliers, distributed RAMs, shift registers (SRL16) and DCMs (any DCM site, more than one
per design, each clock output on a global buffer its dedicated path reaches; `INST "u" LOC =
"DCM_X1Y0"` picks the site). A design the Silinx toolchain cannot implement yet (a feature not in the bit
database, a net it cannot route) fails with the list of what is missing: implement it in an ISE
mode. The supported devices' descriptions and bit databases ship with Silinx: the Silinx toolchain
needs no ISE at all (the Spartan-3E Starter Kit's XC3S500E-FG320 is the Nexys2-500's chip and
package). Developers can build another package's description from an ISE
(`packages/silinx-fpga/research/s3e-route/build-device.mjs`, into `~/.silinx/devices/`) once its pads are in the bit
database. The open
toolchain also takes **the Spartan-6 boards (Nexys3, Atlys)** in the local server, to a bitstream ISE's bitgen
writes byte for byte for the same routing (in the browser edition too, #2103: [docs/OPEN-TOOLCHAIN.md](../../OPEN-TOOLCHAIN.md)). From the command line: `node packages/silinx-fpga/research/s3e-route/open-flow.mjs <project
folder> <out folder>`.
Beyond Xilinx, it takes **the 1BitSquared iCEBreaker** (Lattice iCE40UP5K-SG48): Yosys's `synth_ice40`,
nextpnr-ice40 and icepack, to `build/<top>.bin`, its pins written as a PCF (programmed into its SPI flash from Silinx: over WebUSB in the browser, or with openFPGALoader locally, #2298).
The examples run on it with their seven-segment display and switches on its Pmods 1A and 1B; vga on the
**1BitSquared iCEBreaker + PmodVGA**, a Digilent PmodVGA in those Pmods.
On the 7-series, an experimental family (#3146), it takes **the Digilent Basys 3** (XC7A35T-CPG236) and **the Digilent
Nexys A7** (XC7A100T-CSG324, #3145): in the local server when Silinx is the project's synthesis tool (AMD Vivado is the
default there), and in the browser edition (#3143: about 6.5 MB downloaded on the first run, then kept; the Basys 3's `.bit`
the local server's byte for byte): Yosys's `synth_xilinx`, nextpnr-himbaechel's xilinx
micro-architecture, and the `.bit` written from nextpnr's FASM on Project X-Ray's database; its timing is nextpnr's estimate,
with delays fitted to Vivado's and conservative against its timing (0.7–0.95 times its Fmax on the same netlist, #3875). Every
example builds on both boards with no warning, its clock at the board's 100 MHz (#3147; stopwatch with the best of 3 seeds), and
runs on them in the Board Emulator. Process Properties ▸ *Place & Route (7-series)*: *Best of 3 seeds (router2)* (off
by default, one seed) has nextpnr route it three times and keeps the fastest: about 3 % more Fmax for three times the
time (#3825). The `.bit` is compressed when the XDC sets `BITSTREAM.GENERAL.COMPRESS`, as the boards' do: about 300 KB
instead of 2.19 MB on the Basys 3 (#3876).
It takes **the Radiona ULX3S-12f / 25f / 45f / 85f** too (Lattice ECP5, LFE5U in CABGA381): Yosys's `synth_ecp5`, nextpnr-ecp5
and ecppack (Project Trellis), to `build/<top>.bit`, its pins written as an LPF, loaded into the FPGA by *Configure Target Device* (the
local server's openFPGALoader -b ulx3s, or the browser over WebUSB, #2298). The examples run on it with their seven-segment display on its GPIO header J1; vga on the
**ULX3S + VGA-12f / 25f / 45f / 85f** (the Radiona ULX3S + VGA), a VGA connector on that header.
It takes **the Sipeed Tang Nano 9K** too (Gowin GW1NR-9C): Yosys's `synth_gowin`, nextpnr-himbaechel-gowin (Project Apicula)
and gowin_pack, Silinx's JavaScript port of Apicula's (its `.fs` byte for byte Apicula's on the examples), to `build/<top>.fs`,
its pins written as a CST, loaded into the FPGA by *Configure Target Device* (the local server's openFPGALoader -b tangnano9k, or the browser over WebUSB, #2298). The examples run on it with
their LEDs, switches, buttons and display on its headers (every port needs a pin there); vga on the **Sipeed Tang Nano 9K + VGA**.
How its circuits compare with ISE's (size and speed on the open-source designs of the design corpus):
[docs/QUALITY.md](../../QUALITY.md). How it is developed, and what may be shipped: [docs/OPEN-TOOLCHAIN.md](../../OPEN-TOOLCHAIN.md);
what is planned: the [issues](https://github.com/pmnmalo/Silinx/issues).

**Recommended on Windows, macOS (Intel / Apple Silicon) and Linux:** build a private Docker image
once with the kit in [`docker/ise/`](../../../docker/ise/README.md), from your own installer and WebPACK
license (ISE itself may not be redistributed):

```bash
docker/ise/build-ise-image.sh --installer ~/Downloads/Xilinx_ISE_DS_Lin_14.7_1015_1.tar --license ~/Downloads/Xilinx.lic
```

On Windows use `docker\ise\build-ise-image.ps1`. The script checks the installer and x86-64
emulation, builds `xilinx/ise:14.7`, proves the license with a test synthesis and configures
Silinx. The image keeps only what a command-line flow needs (ISE drops from ~18 GB to ~3 GB, all
device families kept); `--full` keeps the complete install and `--families "spartan3e spartan6"`
keeps only some families.

Other execution modes (*Tools ▸ Toolchain Settings*):

| Mode | Description |
|---|---|
| `local` | ISE installed on this machine (Linux/Windows); `settings64.sh` is detected |
| `docker` | an x86-64 image with ISE 14.7 at `/opt/Xilinx/14.7/ISE_DS` (Silinx never pulls images) |
| `ssh` | another machine, over SSH with key-based authentication: with ISE installed (Linux), or with the ISE Docker image (*Docker image on the remote host*), e.g. an Intel Mac, where ISE runs natively instead of emulated as on Apple Silicon |

Only the project's `build/` folder is mounted in the container (at `/work`); no X11 or `$HOME`
mount is needed for command-line builds. Without ISE, the implementation processes still write
`build/` with `run.sh`, `.prj`, `.xst`, `.ut` and the UCF, ready to run on another machine.

## The Artix-7 boards with AMD Vivado

The Basys 3 and the Nexys A7 (Artix-7, an experimental family) are synthesized, implemented and made into a bitstream by
**AMD Vivado ML Standard 2025.2** (free for these parts), as ISE does for the Spartan-3E: a batch Tcl flow
(`build/run.tcl`: `synth_design`, `opt_design`, `place_design`, `route_design`, `write_bitstream`) with the board's
XDC, its utilization, timing summary and design rule check in the Design Summary, its warnings in the console. It runs
in a mode of its own, `vivado` in `~/.silinx/config.json` (`PUT /api/toolchain`):

```json
{ "vivado": { "mode": "docker", "image": "xilinx/vitis-hls:2025.2", "settings": "" } }
```

- `docker`: an x86-64 image with Vivado under `/tools/Xilinx` (`scripts/vitis-hls-image/` makes one); `ssh`: on the
  ssh host of the ISE settings, in that image there (or with Vivado installed there when `image` is empty); `local`:
  Vivado on this Linux or Windows machine (`settings`: its `settings64.sh`, else found).
- Under x86 emulation (an Apple-silicon Mac) an example takes 2 to 10 minutes from synthesis to bitstream.
- The board is programmed with openFPGALoader (`-b basys3`). Vivado runs on the local server only, not in the browser.

The other 7-series families of Vivado ML Standard are Vivado's too (#3895), with no flow of the Silinx toolchain: the
**Spartan-7** (XC7S6 to XC7S100; the Digilent **Arty S7**-50 and -25), the **Zynq-7000** (XC7Z007S to XC7Z030; the
Digilent **Zybo Z7**-20 and -10: its programmable logic only, the .bit over JTAG, no processing system set up) and the
**Kintex-7** (XC7K70T, XC7K160T; no board). Their Synthesis Tool is Vivado alone. The examples' display, LEDs and
switches these boards lack are on their Pmods. The Virtex-7 is no free edition's: ISE 14.7's flow.

## Programming the board

Programming loads the `.bit` into the FPGA's configuration SRAM (volatile). In the browser it goes
over USB (WebUSB: Chrome or Edge on a computer, Chrome on an Android tablet), with no tool; running
Silinx locally, the supported tools are Digilent Adept (`djtgcfg`), ISE iMPACT, xc3sprog,
openFPGALoader and **adepttool**.

**Basys2 on macOS**: Digilent Adept is not available for macOS; use *adepttool* (open source,
the Basys2's on-board USB), which Silinx uses automatically when `djtgcfg` is not installed:

```bash
brew install libusb python
./scripts/install-adepttool.sh     # installs into ~/.silinx/adepttool (own virtualenv)
```

The script applies `scripts/adepttool-silinx.patch` (claims the USB interface, required on macOS,
and adds the XC3S250E/500E/1200E/1600E IDCODEs). Tested on a real Basys2-250: JTAG scan
(XCF02S + XC3S250E) and programming with DONE.

### Platform Flash PROM: boot at power-up

On the **iMPACT** page, select the PROM in the JTAG chain (Basys2: XCF02S) for *Program PROM*
(erase → write → verify), *Verify*, *Erase*, *Back up PROM* (saved in `build/prom-backup/`) and
*Reload FPGA from PROM*. The image is `build/<top>_prom.bit`, generated with `StartUpClk:CCLK` by
*Generate Programming File*. To boot from flash at power-up, set the mode jumper to **ROM**
(Basys2: JP3). Uses `scripts/xcf_prog.py` (adepttool) over the board's USB; the browser edition does
the same over WebUSB (`core/xcf.js`, Chrome / Edge, Chrome on Android), its backup downloaded as `prom-<date>.bin`.

