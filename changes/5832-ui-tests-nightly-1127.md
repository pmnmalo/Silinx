In detail:

- **The UI tests the nightly of 2026-11-27 failed, made right (#5832, #5833, #5834):** the Circuit editor's parts with the
  ESP32 DevKitC (224, five boards, #5495); I/O Pin Planning's toolbar with its Text view and Check (#5642), in English
  and in Portuguese; a System left with one node checked with no warning (#5756), the test waiting for its fourth Check
  System to end; the memory test counting the console's line times (#5035, a `::before` that Chrome counts as a node)
  with the console, not as a leak; the MCP parity's map with Project ▸ Change Mode… (set_design_properties's mode, #5755),
  Save Version… and Versions… (save_version, list_versions, version_diff, restore_version, #5740).
