In detail:

- **The Intel families' programming files (#5379):** FAMILY_INFO's bitstream for the MAX 10 is '.svf' (its SRAM loaded
  only as an SVF) and for the Cyclone IV E and V '.rbf' (bitstreamExtOf), the files quartus_cpf makes of Quartus's .sof
  and openFPGALoader loads. Tests: program-intel (in the IDE).
