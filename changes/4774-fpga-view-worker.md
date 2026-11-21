In short:

- The FPGA view of a big device no longer holds up the local server: its other pages and requests are answered while
  the device is read.

In detail:

- **The FPGA view's model off the server's thread (#4774):** `GET /projects/:p/fpga-view` builds it in a worker thread
  (`server/fpga-view.js`, `server/fpga-view-worker.js`): the routed design and the device's grid (the Silinx
  toolchain's routing graph, ISE's `device.xdlrc`) are read and parsed there, the last two grids kept by their file
  and time; the requests for the same model while it is built share one build, and the route's file times are read
  asynchronously. An idle worker does not keep the server running.
