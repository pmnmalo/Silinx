; lock.asm: the lock example (the FPGA's: a combination lock) on the Explorer 16/32, in PIC24 assembly (its
; PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, its configuration words erased but the watchdog's, off). Its .hex is
; made from it (Silinx's PIC24 assembler: #5893).
; The code is 2 0 2 6: set a digit with the potentiometer R6, press Enter (S3), the next digit, Enter... The four
; digits right open the lock; a wrong one locks it for a penalty (3 s, then 6 s: the seconds left on the LCD), and the
; third wrong one sounds the alarm until reset.
;   R6           : the digit, 0 to 9 along its travel (the FPGA's SW3..SW0: the Explorer has no switches)
;   S3           : Enter: the digit typed  (BTN0)
;   S6           : Clear: the code started again, and the lock closed  (BTN1)
;   MCLR         : reset  (BTN2)
;   D3 / D4 / D5 : open / alarm / locked out  (LD0 / LD1 / LD2)
;   D7..D10      : the digit, in binary  (LD4..LD7)
;   LCD          : the digits typed on its first row; the digit, Open, the seconds of a lock-out or ALARM on its second
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    mov #0xff00, w0          ; RA0..RA7 outputs: the LEDs
    rcall init
    mov #5, w0
    mov w0, 0x074c           ; AD1CHS: AN5 (R6)
    mov #0x0001, w0
    mov w0, 0x074a           ; AD1CON3: TAD 2 Tcy
    mov #0x8000, w0
    mov w0, 0x0746           ; AD1CON1: the converter on, 10 bits
    clr w4                   ; the digits right so far
    clr w5                   ; the digits typed, a nibble each, the first the lowest
    clr w6                   ; how many typed
    clr w7                   ; the failures
    clr w8                   ; the state: 0 a code typed, 1 open, 2 locked out, 3 alarm
    clr w9                   ; the buttons held
    clr w11                  ; a lock-out's ticks left
loop:
    rcall tick
    rcall buttons
    rcall knob               ; W12: the digit R6 sets
    cp w8, #3                ; the alarm: until reset
    bra z, shown
    cp w8, #2                ; locked out: its time counted down, then a new code
    bra nz, clear
    dec w11, w11
    bra nz, shown
    rcall again
    bra shown
clear:
    btsc w10, #7             ; S6: Clear
    rcall again
    btss w10, #6             ; S3: Enter
    bra shown
    cp w8, #1                ; (open: Clear first)
    bra z, shown
    sl w6, #2, w0            ; the digit typed, after the others
    sl w12, w0, w0
    ior w5, w0, w5
    inc w6, w6
    sl w4, #2, w0            ; the code's digit at its place: 0x6202's nibble
    mov #0x6202, w2
    lsr w2, w0, w0
    and w0, #15, w0
    cp w0, w12
    bra nz, wrong
    inc w4, w4               ; right
    cp w4, #4
    bra nz, shown
    mov #1, w8               ; the four right: open
    clr w7
    bra shown
wrong:
    inc w7, w7
    cp w7, #3
    bra nz, penalty
    mov #3, w8               ; the third: the alarm
    bra shown
penalty:
    mov #2, w8               ; locked out: 3 s a failure
    mov #300, w0
    mul.uu w0, w7, w2        ; W2 300 x the failures
    mov w2, w11
shown:
    rcall show
    bra loop
; again: a new code to type, the lock closed
again:
    clr w4
    clr w5
    clr w6
    clr w8
    return
; knob: W12 the digit R6 sets, 0 to 9: its 10-bit code x 10 / 1024
knob:
    bset 0x0746, #1          ; SAMP: sampling
    repeat #20
    nop
    bclr 0x0746, #1          ; the conversion
adc:
    btss 0x0746, #0          ; DONE
    bra adc
    mov 0x0712, w0           ; ADC1BUF0: 0 to 1023
    sl w0, #3, w2
    sl w0, #1, w0
    add w0, w2, w0           ; x 10
    lsr w0, #10, w12
    return
; show: the digits typed on the first row; the digit, Open, the lock-out's seconds or ALARM on the second; the LEDs
show:
    mov #0x80, w0
    rcall cmd
    mov #0x43, w0            ; 'C'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x64, w0            ; 'd'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    clr w3                   ; each place: its digit, or _
place:
    cp w3, w6
    bra geu, empty
    sl w3, #2, w0
    lsr w5, w0, w0
    and w0, #15, w0
    push w3
    rcall digit
    pop w3
    bra next
empty:
    mov #0x5f, w0            ; '_'
    rcall chr
next:
    mov #0x20, w0
    rcall chr
    inc w3, w3
    cp w3, #4
    bra nz, place
    mov #3, w3
    rcall spaces
    mov #0xc0, w0
    rcall cmd
    cp w8, #1
    bra nz, locked
    mov #0x4f, w0            ; 'O'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    bra leds
locked:
    cp w8, #2
    bra nz, alarm
    mov #0x57, w0            ; 'W'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w11, w0
    mov #99, w2
    add w0, w2, w0
    mov #100, w2
    repeat #17
    div.u w0, w2             ; the seconds left, rounded up
    rcall digit
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    bra leds
alarm:
    cp w8, #3
    bra nz, typing
    mov #0x41, w0            ; 'A'
    rcall chr
    mov #0x4c, w0            ; 'L'
    rcall chr
    mov #0x41, w0            ; 'A'
    rcall chr
    mov #0x52, w0            ; 'R'
    rcall chr
    mov #0x4d, w0            ; 'M'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    bra leds
typing:
    mov #0x44, w0            ; 'D'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x67, w0            ; 'g'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w12, w0
    rcall digit
    mov #9, w3
    rcall spaces
leds:
    sl w12, #4, w0           ; D7..D10: the digit
    cp w8, #1
    bra nz, l2
    bset w0, #0              ; D3: open
l2:
    cp w8, #3
    bra nz, l3
    bset w0, #1              ; D4: the alarm
l3:
    cp w8, #2
    bra ltu, out
    bset w0, #2              ; D5: locked out (and in the alarm)
out:
    mov w0, 0x0666           ; LATA
    return
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
