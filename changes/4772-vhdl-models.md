In detail:

- **The VHDL models' ports, one reader (#4772):** core/vhdl-models.js `vhdlModels` (an entity's generics, its ports and
  their widths, the inputs with a default) for the routed design's readers of the Gowin (core/gowin-routed.js) and of the
  7-series (core/xc7-routed.js, its `unisimModels` still exported), which each had their own; the same models read.
  Tests: vhdl-models (the rules; the Gowin's copy, as it was, the reference on its models; the UNISIM models by name).
