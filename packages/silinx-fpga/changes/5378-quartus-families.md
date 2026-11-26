In detail:

- **The Intel families implemented by Intel Quartus Prime (#5378):** FAMILY_INFO's max10, cyclone4e and cyclone5 have
  backEnd 'quartus' and no Silinx toolchain's flow (openFlow false; openOnlyDevice now a family with no back end of its
  own), their next text saying Quartus implements them on the local server; quartusDevice (an Intel FPGA). Tests: qsf,
  silinx-fpga-api.
