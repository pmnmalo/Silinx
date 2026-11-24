In detail:

- **The bit, shift, multiply, divide and program flow instructions (#5480):** BSET, BCLR, BTG, BTST, BTSTS, BSW, BTSC,
  BTSS on Ws and on f; FBCL, FF1L, FF1R; SL, LSR, ASR, RLC, RLNC, RRC, RRNC on Ws and on f, and SL, LSR, ASR by Wns or
  #lit4; MUL.UU, MUL.US, MUL.SU, MUL.SS and MUL f; the iterative DIV.S, DIV.U, DIV.SD, DIV.UD (REPEAT #17's target: the
  dividend copied at the first iteration, the quotient and remainder at the last; a divide by zero the math error trap;
  other than 18 executions said); BRA on its 15 conditions and by Wn, CALL, RCALL, GOTO by address and by Wn, RETURN,
  RETLW, RETFIE; CPSEQ, CPSNE, CPSGT, CPSLT; REPEAT #lit14 and Wn; DISI; PWRSAV (sleep and idle until an interrupt);
  RESET, CLRWDT, BOOTSWP (not emulated: said), PUSH.S and POP.S, NOPR. Their cycles: 2 for a change of the PC, 3 for
  a return (2 with an exception pending), a skip's 2 or 3. Tests: every condition of BRA against its definition over
  N, OV, Z, C; the products and quotients against the integers'; the manual's worked examples, all 228 run; a loop's
  cycles by hand.
