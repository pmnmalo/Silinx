; clock.asm: the clock example (the FPGA's: a digital clock set with the buttons) on the Explorer 16/32, in PIC24
; assembly (its PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, its configuration words erased but the watchdog's,
; off). Its .hex is made from it (Silinx's PIC24 assembler: #5893).
;   LCD     : hours and minutes, HH:MM (the colon blinks every second), on its first row; what it shows on its second
;   S3      : hours + 1  (the FPGA's BTN3)
;   S4      : minutes + 1  (BTN2)
;   S6      : seconds to 0 (press it when the minute changes on another clock: synchronised)  (BTN1)
;   S5      : minutes and seconds (MM:SS) instead of hours and minutes, and back  (BTN0)
;   D3..D8  : the seconds, in binary; D9 blinks with the seconds (the FPGA's LD5..LD0 and LD7)
;   MCLR    : reset (00:00) (SW0)
; 24-hour only: the FPGA's 12-hour switch (SW1) is not here, the Explorer has no switches. S5's pin is D10's too (RA7):
; an input here, so D10 is not used.
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    mov #0xff80, w0          ; RA0..RA6 outputs (D3..D9), RA7 an input (S5)
    rcall init
    clr w4                   ; the seconds
    clr w5                   ; the minutes
    clr w6                   ; the hours
    clr w7                   ; shown: 0 HH:MM, 1 MM:SS
    clr w8                   ; the ticks of this second, 0 to 99
    clr w9                   ; the buttons held
    rcall show
loop:
    rcall tick
    rcall buttons
    btss w10, #6             ; S3: hours + 1
    bra s4
    rcall hour
s4:
    btss w10, #13            ; S4: minutes + 1 (the hours as they are)
    bra s6
    inc w5, w5
    mov #60, w0
    cp w5, w0
    bra nz, s6
    clr w5                   ; 59, then 00
s6:
    btss w10, #7             ; S6: the seconds to 0
    bra s5
    clr w4
    clr w8
s5:
    btsc w10, #0             ; S5: HH:MM or MM:SS
    btg w7, #0
    inc w8, w8               ; a tick: 10 ms
    mov #100, w0
    cp w8, w0
    bra nz, shown
    clr w8                   ; a second
    inc w4, w4
    mov #60, w0
    cp w4, w0
    bra nz, shown
    clr w4                   ; a minute
    inc w5, w5
    mov #60, w0
    cp w5, w0
    bra nz, shown
    clr w5                   ; an hour
    rcall hour
shown:
    rcall show
    bra loop
; hour: the hours + 1, 23 then 00
hour:
    inc w6, w6
    cp w6, #24
    bra nz, done
    clr w6
done:
    return
; show: the time on the first row (HH:MM or MM:SS, its colon lit in each second's first half), what it is on the
; second; the seconds on the LEDs
show:
    mov #0x80, w0
    rcall cmd
    mov #5, w3
    rcall spaces
    mov w6, w0               ; HH:MM
    mov w5, w11
    btss w7, #0
    bra first
    mov w5, w0               ; MM:SS
    mov w4, w11
first:
    rcall digits
    mov #0x3a, w0            ; ':'
    mov #50, w2
    cp w8, w2
    bra ltu, colon
    mov #0x20, w0            ; (its second half: no colon)
colon:
    rcall chr
    mov w11, w0
    rcall digits
    mov #6, w3
    rcall spaces
    mov #0xc0, w0
    rcall cmd
    btsc w7, #0
    bra seconds
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x48, w0            ; 'H'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x6d, w0            ; 'm'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    bra leds
seconds:
    mov #0x4d, w0            ; 'M'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x63, w0            ; 'c'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x64, w0            ; 'd'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
leds:
    mov w4, w0               ; D3..D8: the seconds
    mov #50, w2
    cp w8, w2
    bra geu, out
    bset w0, #6              ; D9: each second's first half
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
