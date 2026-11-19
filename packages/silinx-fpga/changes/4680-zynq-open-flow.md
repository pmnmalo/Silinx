In detail:

- **The Zynq-7000's programmable logic (#4680):** the bit databases of the `xc7z010clg400-1` and the `xc7z020clg400-1`
  (Project X-Ray's `zynq7`; `research/xc7/build-db.mjs` takes the family's folder from the part), the family `zynq`'s
  back end the 7-series' (`openFamilyOf`: `'artix7'`), its open parts the XC7Z010 and the XC7Z020 (`openFlowDevice`),
  the BSCAN's tile of the part (`xc7BscanTile`), nextpnr-himbaechel-xc7 0.4.0 (the chip databases of the xc7z010 and the
  xc7z020).
