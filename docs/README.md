# Silinx's documentation

## For those who use Silinx

The user's guide, in [English](user/en/README.md) and in [Português](user/pt/README.md): what Silinx is, getting
started, designing, simulating, the Board Emulator, boards and toolchains, teaching, AI assistants, questions. Its
pictures are in [images/](images/README.md), made by a script.

## For those who change Silinx

Start with [CONTRIBUTING.md](../CONTRIBUTING.md); the project's rules are in [CLAUDE.md](../CLAUDE.md), for people and
AI agents alike, and [ONBOARDING.md](../ONBOARDING.md) is the maintainer's sessions' map of the code.

| Document | What it holds |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | running Silinx from its source, the command line, the standalone edition, the repository's layout |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Silinx as a whole: the editions, the layers, each part and its files |
| [TOOLCHAIN.md](TOOLCHAIN.md) | the toolchain, from a design to a `.bit`: its processes, tools and families |
| [OPEN-TOOLCHAIN.md](OPEN-TOOLCHAIN.md) | how the Silinx toolchain is developed: the bit database's measures, the legal basis |
| [TOOLCHAIN-SEPARATION.md](TOOLCHAIN-SEPARATION.md) | the toolchain as a package of its own, `silinx-fpga` |
| [QUALITY.md](QUALITY.md) | the Silinx toolchain's circuits against Xilinx ISE's: size and speed (written by the weekly comparison) |
| [UI-GUIDELINES.md](UI-GUIDELINES.md) | the interface's rules for its editors and viewers |
| [IR.md](IR.md) | the HDL parsers' intermediate representation |
| [PROJECT.md](PROJECT.md) | the project model and its API |
| [SYSTEMS.md](SYSTEMS.md) | Systems (roadmap #4695): FPGA and microcontroller nodes in a System document, simulated together |
| [HISTORY.md](HISTORY.md) | who started Silinx, why, and how it grew |

The files at the top of `docs/` whose names are in capitals and that hold one line (GETTING-STARTED, COMECAR,
CIRCUITS, GRADING, CLASSROOM, c-to-hdl) only point to their pages in the user's guide, for the links made before it.
