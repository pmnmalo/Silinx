; blinky.asm: the blinky example (the FPGA's: a knight rider and its steps counted in decimal) on the Explorer 16/32,
; in PIC24 assembly (its PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, its configuration words erased but the
; watchdog's, off). Its .hex is made from it (Silinx's PIC24 assembler: #5893).
;   LEDs D3..D10 : a knight rider (one LED going to and fro), or the steps in binary
;   LCD          : the mode on its first row; the steps counted in decimal, 0000 to 9999, and the speed on its second
;   S3           : the mode: knight rider or binary counter
;   S4 / S6      : faster / slower (8 speeds: a step every 2^speed x 10 ms, from 10 ms to 1.28 s; 5 at the start)
;   MCLR         : reset
; The FPGA's switches (reset, pause, invert) are the Explorer's MCLR button, or not here: it has no switches.
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    mov #0xff00, w0          ; RA0..RA7 outputs: the LEDs
    rcall init
    clr w4                   ; the knight's LED, 0 (D3) to 7 (D10)
    clr w5                   ; its way: 0 up, 1 down
    clr w6                   ; the mode: 0 knight rider, 1 binary counter
    mov #5, w7               ; the speed
    clr w8                   ; the ticks of this step
    clr w9                   ; the buttons held
    clr w12                  ; the steps, 0 to 9999
    mov #1, w0
    mov w0, 0x0666           ; LATA: D3, the knight's first place
    rcall title
    rcall show
loop:
    rcall tick
    rcall buttons
    btss w10, #6             ; S3: the mode
    bra s4
    btg w6, #0
    rcall title
s4:
    btss w10, #13            ; S4: faster
    bra s6
    cp0 w7
    bra z, s6
    dec w7, w7
    rcall show
s6:
    btss w10, #7             ; S6: slower
    bra wait
    cp w7, #7
    bra z, wait
    inc w7, w7
    rcall show
wait:
    inc w8, w8               ; a step every 2^speed ticks
    mov #1, w0
    sl w0, w7, w0
    cp w8, w0
    bra ltu, loop
    clr w8
    rcall step
    bra loop
; step: the knight moved on, the steps counted, shown
step:
    cp0 w5
    bra nz, down
    inc w4, w4
    cp w4, #7
    bra nz, counted
    mov #1, w5               ; at D10: back down
    bra counted
down:
    dec w4, w4
    bra nz, counted
    clr w5                   ; at D3: back up
counted:
    inc w12, w12
    mov #10000, w0
    cp w12, w0
    bra nz, leds
    clr w12                  ; 9999, then 0000
leds:
    mov #1, w0
    sl w0, w4, w0            ; the knight's LED
    btsc w6, #0
    mov w12, w0              ; or the steps in binary
    mov w0, 0x0666           ; LATA
    bra show
; title: the mode on the first row
title:
    mov #0x80, w0
    rcall cmd
    btsc w6, #0
    bra binary
    mov #0x4b, w0            ; 'K'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x67, w0            ; 'g'
    rcall chr
    mov #0x68, w0            ; 'h'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x64, w0            ; 'd'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    return
binary:
    mov #0x42, w0            ; 'B'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x79, w0            ; 'y'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x63, w0            ; 'c'
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
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    return
; show: the steps (4 digits) and the speed on the second row
show:
    mov #0xc0, w0
    rcall cmd
    mov #0x53, w0            ; 'S'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #100, w2
    repeat #17
    div.u w12, w2            ; W0 the thousands and hundreds, W1 the tens and units
    push w1
    rcall digits
    pop w0
    rcall digits
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w7, w0
    rcall digit
    mov #2, w3
    bra spaces
; ---- the board: its LEDs and buttons' pins, Timer1's 10 ms tick, the LCD through the EPMP (W13 its address)
init:
    clr 0x066a               ; ANSA: RA0..RA7 digital
    clr 0x06a6               ; ANSD: RD6, RD7, RD13 (S3, S6, S4) digital
    mov w0, 0x0662           ; TRISA: as W0 says (the LEDs outputs, RA7 an input where S5 is read)
    mov #19999, w0
    mov w0, 0x0192           ; PR1: 20000 cycles of Fcy 2 MHz, 10 ms
    mov #0x8000, w0
    mov w0, 0x0194           ; T1CON: Timer1 on
    mov #0x0200, w0
    mov w0, 0x0132           ; PMCS1BS: the LCD at EDS 0x020000
    mov #0x8300, w0
    mov w0, 0x0128           ; PMCON1: the EPMP on, master mode
    mov #4, w0
    mov w0, 0x0032           ; DSRPAG
    mov w0, 0x0034           ; DSWPAG
    mov #0x8000, w13         ; the LCD: RS 0 at [W13], RS 1 at [W13+1]
    mov #0x38, w0            ; function set: 8 bits, 2 rows
    rcall cmd
    mov #0x0c, w0            ; display on
    rcall cmd
    mov #0x06, w0            ; entry mode: to the right
    rcall cmd
    mov #0x01, w0            ; clear
    bra cmd
; tick: until Timer1's next period ends (every 10 ms)
tick:
    btss 0x0088, #3          ; IFS0: T1IF
    bra tick
    bclr 0x0088, #3
    return
; buttons: W10 the buttons pressed since the last tick, W9 the ones held (a 1 a pressed button): bit 6 S3, bit 7 S6,
; bit 13 S4 (PORTD's), bit 0 S5 (RA7, read where it is an input)
buttons:
    mov 0x06a0, w0           ; PORTD
    btsc 0x0662, #7          ; RA7 an input: S5 read
    bra pressed5
    bset w0, #0              ; (S5 not read: released)
    bra held
pressed5:
    bclr w0, #0
    btsc 0x0664, #7          ; PORTA: RA7
    bset w0, #0
held:
    com w0, w0               ; a pressed button's pin at 0
    mov #0x20c1, w2
    and w0, w2, w0           ; S3, S6, S4, S5
    com w9, w2
    and w0, w2, w10          ; pressed now, not before
    mov w0, w9
    return
; cmd: W0 an instruction to the LCD; chr: W0 a character; each once the LCD is not busy (its busy flag, RS 0's bit 7)
cmd:
    rcall busy
    mov.b w0, [w13]
    return
chr:
    rcall busy
    mov.b w0, [w13+1]
    return
busy:
    mov.b [w13], w2
    btsc w2, #7
    bra busy
    return
; digits: W0 (0 to 99) as two decimal digits; digit: W0 (0 to 9) as one
digits:
    mov #10, w2
    repeat #17
    div.u w0, w2             ; W0 the tens, W1 the units
    push w1
    rcall digit
    pop w0
digit:
    mov #0x30, w2
    add w0, w2, w0
    bra chr
; spaces: W3 spaces
spaces:
    mov #0x20, w0
    rcall chr
    dec w3, w3
    bra nz, spaces
    return
