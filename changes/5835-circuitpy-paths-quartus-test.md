In detail:

- **Two host-dependent failures of the nightly of 2026-11-27 (#5835):** the CIRCUITPY drive's macOS and Linux mount
  folders joined as POSIX paths whatever the host (`path.posix.join`: on Windows the macOS candidates had backslashes);
  the Quartus test expects the docker command's absence on a machine without Docker (CI's macOS runner), as Vivado's.
