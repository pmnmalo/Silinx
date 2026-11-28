; lcd_uart.asm: the Explorer 16/32's firmware of the uart-fpga-pic24 example (a PIC24FJ1024GB610, Fcy 2 MHz: the FRC
; divided, as its configuration words are erased but the watchdog's, off), its .hex built from it by Silinx's
; assembler. UART2 at 9600 baud, 8N1, on the USB-UART's pins through PPS (U2RX on RP10, RF4; U2TX on RP17, RF5), linked to the FPGA: it writes
; "PIC24 + FPGA" on the LCD's first row, sends "Hi from PIC24!" CR LF to the FPGA, then shows each byte it receives
; (the FPGA echoes each one back; its BTN0 sends "Hello from Silinx!") on the LCD's second row, a LF starting the row
; again, and the last one on its LEDs D3..D10 (RA0..RA7). In xc16-as's syntax (#5931): XC16 builds it as Silinx's
; PIC24 assembler does.
    .include "p24FJ1024GB610.inc"
    config __FWDT, FWDTEN_OFF   ; the watchdog off (the other configuration words erased)
    .global __reset
    .text
__reset:
    mov #0x0900, w15         ; the stack
    clr ANSA               ; ANSA: RA0..RA7 digital
    mov #0xff00, w0          ; TRISA: RA0..RA7 outputs (the LEDs)
    mov w0, TRISA
; UART2 first, its TX idle high while the LCD is set up (a receiver sees the line idle before the first start bit):
; its pins through PPS, 9600 baud (U2BRG 12: 2 MHz / (16 * 13) = 9615), on, its receiver and transmitter on
    mov #0x3f0a, w0
    mov w0, RPINR19           ; RPINR19: U2RX on RP10 (RF4)
    mov #0x0500, w0
    mov w0, RPOR8           ; RPOR8: U2TX (5) on RP17 (RF5)
    mov #12, w0
    mov w0, U2BRG           ; U2BRG
    mov #0x8000, w0
    mov w0, U2MODE           ; U2MODE: UARTEN
    mov #0x1400, w0
    mov w0, U2STA           ; U2STA: URXEN, UTXEN
; the LCD through the EPMP: CS1 at EDS 0x020000 (PMCS1BS), EA 0x8000 with DSRPAG and DSWPAG 4 its RS 0, 0x8001 its RS 1
    mov #0x0200, w0
    mov w0, PMCS1BS           ; PMCS1BS
    mov #0x8300, w0
    mov w0, PMCON1           ; PMCON1: the EPMP on, master mode
    mov #4, w0
    mov w0, _DSRPAG          ; DSRPAG (_DSRPAG: the .inc's DSRPAG is its bit field's position, 0, #6025)
    mov w0, _DSWPAG          ; DSWPAG (as _DSRPAG)
    mov #0x8000, w1          ; the LCD
    mov #0x38, w0          ; function set: 8 bits, 2 rows
    rcall cmd
    mov #0x0c, w0          ; display on
    rcall cmd
    mov #0x06, w0          ; entry mode: to the right
    rcall cmd
    mov #0x01, w0          ; clear
    rcall cmd
    mov #0x50, w0          ; 'P'
    rcall chr
    mov #0x49, w0          ; 'I'
    rcall chr
    mov #0x43, w0          ; 'C'
    rcall chr
    mov #0x32, w0          ; '2'
    rcall chr
    mov #0x34, w0          ; '4'
    rcall chr
    mov #0x20, w0          ; ' '
    rcall chr
    mov #0x2b, w0          ; '+'
    rcall chr
    mov #0x20, w0          ; ' '
    rcall chr
    mov #0x46, w0          ; 'F'
    rcall chr
    mov #0x50, w0          ; 'P'
    rcall chr
    mov #0x47, w0          ; 'G'
    rcall chr
    mov #0x41, w0          ; 'A'
    rcall chr
    mov #0xc0, w0          ; the second row
    rcall cmd
    clr w4                   ; (no LF received yet)
; the hello, each byte's echo served while the next is sent (UART2 holds 4 bytes received: more would be lost)
    mov #0x48, w0          ; 'H'
    rcall say
    mov #0x69, w0          ; 'i'
    rcall say
    mov #0x20, w0          ; ' '
    rcall say
    mov #0x66, w0          ; 'f'
    rcall say
    mov #0x72, w0          ; 'r'
    rcall say
    mov #0x6f, w0          ; 'o'
    rcall say
    mov #0x6d, w0          ; 'm'
    rcall say
    mov #0x20, w0          ; ' '
    rcall say
    mov #0x50, w0          ; 'P'
    rcall say
    mov #0x49, w0          ; 'I'
    rcall say
    mov #0x43, w0          ; 'C'
    rcall say
    mov #0x32, w0          ; '2'
    rcall say
    mov #0x34, w0          ; '4'
    rcall say
    mov #0x21, w0          ; '!'
    rcall say
    mov #0x0d, w0          ; CR
    rcall say
    mov #0x0a, w0          ; LF
    rcall say
loop:
    rcall serve
    bra loop
; serve: each byte received: on the LEDs, then on the LCD's second row (CR ignored; after a LF, W4 set, the row is
; cleared and started again at the next line's first character); OERR cleared (a byte lost: the receiver on again)
serve:
    bclr U2STA, #1          ; OERR
    btss U2STA, #0          ; URXDA: a byte received
    return
    mov U2RXREG, w0           ; U2RXREG
    mov w0, LATA           ; LATA: the LEDs
    cp w0, #10
    bra z, lf
    cp w0, #13
    bra z, serve
    cp0 w4
    bra z, show
    clr w4
    mov w0, w5               ; (the character kept while the row is cleared)
    mov #0xc0, w0
    rcall cmd
    mov #16, w3
blank:
    mov #0x20, w0
    rcall chr
    dec w3, w3
    bra nz, blank
    mov #0xc0, w0
    rcall cmd
    mov w5, w0
show:
    rcall chr
    bra serve
lf:
    mov #1, w4
    bra serve
; say: W0 sent, then what was received served
say:
    rcall send
    rcall serve
    return
; cmd: W0 an instruction to the LCD; chr: W0 a character; each once the LCD is not busy (its busy flag, RS 0's bit 7)
cmd:
    rcall busy
    mov.b w0, [w1]
    return
chr:
    rcall busy
    mov.b w0, [w1+1]
    return
busy:
    mov.b [w1], w2
    btsc w2, #7
    bra busy
    return
; send: W0 to the FPGA, once UART2's transmit buffer has room (UTXBF clear)
send:
    btsc U2STA, #9
    bra send
    mov w0, U2TXREG           ; U2TXREG
    return
