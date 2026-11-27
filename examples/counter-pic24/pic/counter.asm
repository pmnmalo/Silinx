; counter.asm: the counter-pic24 example's firmware: an 8-bit binary counter on the LEDs D3..D10 (RA0..RA7, D3 its
; lowest bit), one count every quarter of a second, from 0 to 255 and again, and on the LCD: "Counter" on its first
; row, the count in hexadecimal on its second ("0x2A")
; (the Explorer 16/32's PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, as its configuration words are erased but the
; watchdog's, off). Its .hex is made from it (the uart-pic24 example's way: no XC16 needed to run it).
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    clr 0x066a               ; ANSA: RA0..RA7 digital
    mov #0xff00, w0          ; TRISA: RA0..RA7 outputs (the LEDs D3..D10)
    mov w0, 0x0662
; the LCD through the EPMP: CS1 at EDS 0x020000 (PMCS1BS), EA 0x8000 with DSRPAG and DSWPAG 4 its RS 0, 0x8001 its RS 1
    mov #0x0200, w0
    mov w0, 0x0132           ; PMCS1BS
    mov #0x8300, w0
    mov w0, 0x0128           ; PMCON1: the EPMP on, master mode
    mov #4, w0
    mov w0, 0x0032           ; DSRPAG
    mov w0, 0x0034           ; DSWPAG
    mov #0x8000, w1          ; the LCD
    mov #0x38, w0            ; function set: 8 bits, 2 rows
    rcall cmd
    mov #0x0c, w0            ; display on
    rcall cmd
    mov #0x06, w0            ; entry mode: to the right
    rcall cmd
    mov #0x01, w0            ; clear
    rcall cmd
    mov #0x43, w0            ; 'C'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    clr w4                   ; the count
loop:
    mov w4, 0x0666           ; LATA: the LEDs
    mov #0xc0, w0            ; the LCD's second row
    rcall cmd
    mov #0x30, w0            ; '0'
    rcall chr
    mov #0x78, w0            ; 'x'
    rcall chr
    lsr w4, #4, w0           ; the high digit
    rcall hex
    mov #15, w5
    and w4, w5, w0           ; the low digit
    rcall hex
    rcall wait
    inc w4, w4
    mov #0xff, w5
    and w4, w5, w4           ; from 0 to 255
    bra loop
; hex: W0 (0..15) on the LCD as a hexadecimal digit
hex:
    mov #10, w5
    cp w0, w5
    bra lt, digit
    add w0, #7, w0           ; 'A' for 10
digit:
    mov #0x30, w5
    add w0, w5, w0           ; '0' for 0
; chr: W0 a character; cmd: W0 an instruction to the LCD; each once the LCD is not busy (its busy flag, RS 0's bit 7)
chr:
    rcall busy
    mov.b w0, [w1+1]
    return
cmd:
    rcall busy
    mov.b w0, [w1]
    return
busy:
    mov.b [w1], w2
    btsc w2, #7
    bra busy
    return
; wait: a quarter of a second, 5 x 33333 x 3 cycles
wait:
    mov #5, w3
outer:
    mov #33333, w2
inner:
    dec w2, w2
    bra nz, inner
    dec w3, w3
    bra nz, outer
    return
