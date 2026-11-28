; stopwatch.asm: the stopwatch example (the FPGA's: a stopwatch with lap memory) on the Explorer 16/32, in PIC24
; assembly (its PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, its configuration words erased but the watchdog's,
; off). Its .hex is made from it (Silinx's PIC24 assembler: #5893).
;   LCD         : the time, seconds and hundredths, 00.00 to 99.99 (then 00.00 again), on its first row (a lap's while
;                 the laps are recalled); the laps stored, and running or stopped, on its second
;   S3          : start / stop (while recalling the laps: back to the running time)  (the FPGA's BTN0)
;   S4          : lap: the time stored (up to 99 laps, in the PIC24's RAM); D3..D9 count the laps  (BTN1)
;   S6          : clear (when stopped): the time and the laps  (BTN2)
;   S5          : recall: the stored laps one after the other (D3..D9: the lap's number), then back  (BTN3)
;   MCLR        : reset (SW0)
; S5's pin is D10's too (RA7): an input here, so D10 is not used.
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    mov #0xff80, w0          ; RA0..RA6 outputs (D3..D9), RA7 an input (S5)
    rcall init
    clr w6                   ; stopped
    clr w7                   ; no lap stored
    clr w8                   ; not recalling
    clr w9                   ; the buttons held
    clr w12                  ; the time, in hundredths of a second
    rcall show
loop:
    rcall tick
    rcall buttons
    btss w10, #6             ; S3: start / stop, or back from the laps
    bra s4
    cp0 w8
    bra z, startstop
    clr w8
    bra s4
startstop:
    btg w6, #0
s4:
    btss w10, #13            ; S4: a lap, while running
    bra s6
    cp0 w6
    bra z, s6
    mov #99, w0
    cp w7, w0
    bra z, s6
    mov #0x1000, w0          ; the laps' memory
    add w0, w7, w0
    add w0, w7, w0           ; (a word each)
    mov w12, [w0]
    inc w7, w7
s6:
    btss w10, #7             ; S6: clear, when stopped
    bra s5
    cp0 w6
    bra nz, s5
    clr w12
    clr w7
    clr w8
s5:
    btss w10, #0             ; S5: the next lap recalled, then back
    bra count
    cp0 w7
    bra z, count
    inc w8, w8
    cp w8, w7
    bra leu, count
    clr w8
count:
    cp0 w6                   ; running: a hundredth more
    bra z, shown
    inc w12, w12
    mov #10000, w0
    cp w12, w0
    bra nz, shown
    clr w12
shown:
    rcall show
    bra loop
; show: the time (or the lap recalled) on the first row, the laps and the state on the second, the LEDs
show:
    mov #0x80, w0
    rcall cmd
    mov w12, w4              ; the time shown
    cp0 w8
    bra nz, lap
    mov #0x54, w0            ; 'T'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x6d, w0            ; 'm'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    bra time
lap:
    mov #0x4c, w0            ; 'L'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w8, w0
    rcall digits
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x0ffe, w0          ; the lap's time: the word before lap W8's place
    add w0, w8, w0
    add w0, w8, w0
    mov [w0], w4
time:
    mov #100, w2
    repeat #17
    div.u w4, w2             ; W0 the seconds, W1 the hundredths
    push w1
    rcall digits
    mov #0x2e, w0            ; '.'
    rcall chr
    pop w0
    rcall digits
    mov #3, w3
    rcall spaces
    mov #0xc0, w0
    rcall cmd
    mov #0x4c, w0            ; 'L'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w7, w0
    rcall digits
state:
    btss w6, #0
    bra stopped
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x69, w0            ; 'i'
    rcall chr
    mov #0x6e, w0            ; 'n'
    rcall chr
    mov #0x67, w0            ; 'g'
    rcall chr
    bra leds
stopped:
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x74, w0            ; 't'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x70, w0            ; 'p'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x64, w0            ; 'd'
    rcall chr
leds:
    mov w7, w0               ; D3..D9: the laps, or the lap recalled
    cp0 w8
    bra z, out
    mov w8, w0
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
