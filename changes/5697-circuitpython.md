In short:

- **CircuitPython on the Raspberry Pi Pico:** a Pico node's Firmware, in its Properties, is MicroPython or CircuitPython;
  in CircuitPython its program is the `code.py` of its CIRCUITPY drive, with its folder's other files, run on
  CircuitPython's own firmware (downloaded once by the local server). Program Node copies them to a real Pico's CIRCUITPY
  drive. A new System example, **uart-pico**: uart-avr with a Pico on CircuitPython.

In detail:

- **CircuitPython's firmware for the Pico node (#5697):** CircuitPython 10.3.2 (Adafruit's, MIT) pinned in
  `core/rp2040-firmware.js` by its address and SHA-256 and downloaded once as MicroPython's is (NOTICE,
  THIRD-PARTY-NOTICES); both firmwares followed by the Pins workflow (`PINNED`: their tags and SHA-256). Its program is
  `code.py` on a FAT12 CIRCUITPY drive Silinx makes in the flash (`core/fat-image.js`, `core/circuitpython-drive.js`), with
  the node's folder's other files (`lib/`, `settings.toml`), and what starts it at once as on a connected board (no
  safe-mode wait, its `boot_out.txt`, a first run that waits for the USB host); its console from `code.py output:` on,
  its escapes out, then its REPL; a traceback its error. rp2040js for it: DTR set to the CDC interface, BOOTSEL released, a
  UART's TX idle high once it is on. Tested against the simulation: `board`, `digitalio`, `analogio`, `pwmio`, `time`,
  `busio.UART`. The node's `runtime` in the System document, its check, its Properties' Firmware, MCP `edit_system`; its
  plan and Program Node (MCP `program_board`) copy it to the mounted CIRCUITPY drive (`server/circuitpy-copy.js`), or say
  how. The example `uart-pico`.
- **The RP2040 node (#5697):** an ADC input (GP26..GP28) reads its pin's level (0 V or 3.3 V), and a floating input its
  pull-up, on MicroPython too.
