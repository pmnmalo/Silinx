In short:

- An ESP32 node's busy wait (`while not u.any(): pass`, `while time.ticks_us() < t: pass`) takes time and ends.

In detail:

- **An ESP32 node's `while` loop a line's time each check of its condition (#5751):** MicroPython's trace says a line
  only when the line changes, and a loop's check carries its body's last line, so a loop whose body was one line took no
  time and never handed back to the scheduler (the node stopped after 30 s with "its MicroPython did not answer"). Each
  `while` header of the program now goes through `_silinx_loop` with its line, on the same line: its first check the
  header's own line, every other one 1 µs, as CPython's trace counts it (a loop of more lines takes 1 µs more a pass).
  Both back ends (Worker and JSPI). Tests: system-sim-esp32 (the headers rewritten; a wait on the time, on a byte typed,
  an inline loop's time).
