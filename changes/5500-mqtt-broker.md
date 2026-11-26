In short:

- **MQTT in a System:** an MQTT Broker node and the Raspberry Pi Pico W: its MicroPython program connects, publishes and
  subscribes with `network` and `umqtt.simple`, as on the real board, and Try it shows the broker's messages; a line typed
  to the broker is published.

In detail:

- **Network links and an MQTT broker node (#5500):** the link kind `mqtt` (its messages on the scheduler's wires after the
  network's 1 ms latency, deterministic), the node kind `broker` (`core/system-mqtt.js`: MQTT 3.1.1's connect, subscribe
  and unsubscribe with + and #, publish, retained messages, QoS 0; its traffic its view; a filter nobody published to
  said in the run's report), the board `pico-w` with Silinx's behavioural `network` and `umqtt.simple` (`core/micropython-net.js`, over the
  node's USB serial port), their check and edits, the System editor's MQTT Broker tool and + MQTT, the MCP's `edit_system`,
  `check_system` and `simulate` (the broker's traffic in its data).
