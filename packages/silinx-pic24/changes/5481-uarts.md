In detail:

- **The UARTs (#5481):** uart.js, UART1 to UART6: UxMODE (UARTEN, LPBACK, BRGH, PDSEL, STSEL), UxSTA (UTXISEL, URXEN,
  UTXEN, UTXBF, TRMT, URXISEL, FERR, OERR, URXDA), the 4-deep transmit and receive buffers, the baud from UxBRG
  (Fcy / 16 or / 4 · (UxBRG + 1)), each frame's time (8N1, 8E1, 8O1, 9N1, two stops), the receive, transmit and error
  interrupts (U1 IRQ 11, 12, 65; U2 30, 31, 66; …); a character sent leaves by `onTransmit(byte, t)` at its frame's
  end and its bits by `onTxBits`, one received arrives by `receive(byte)`; a character written with the buffer full
  is lost, said. Not modelled: IrDA, the flow control pins, auto-baud, the break, the address detect, the pins'
  polarity inversions. Tests: pic24-uart (the baud and the frames, a program sending a line, the buffers and
  their limits, OERR and its interrupt, UTXISEL and URXISEL, the loopback, a program echoing a terminal's
  characters).
