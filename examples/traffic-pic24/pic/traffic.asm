; traffic.asm: the traffic example (the FPGA's: a pedestrian crossing) on the Explorer 16/32, in PIC24 assembly (its
; PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, its configuration words erased but the watchdog's, off). Its .hex is
; made from it (Silinx's PIC24 assembler: #5893).
; The cars have green until a pedestrian presses S3; then (after at least 5 s of green) yellow 2 s, all red 1 s, the
; pedestrians' green 5 s, their green blinking 3 s (the seconds left to cross on the LCD, 8 to 1), all red 1 s, and the
; cars' green again.
;   D10 / D9 / D8 : the cars' red / yellow / green (the FPGA's LD7 / LD6 / LD5)
;   D4 / D3       : the pedestrians' red / green (LD1 / LD0)
;   LCD           : the phase on its first row; the seconds left to cross on its second
;   S3            : "press to cross" (BTN0): remembered until the pedestrians get their green
;   S6            : night mode on and off (SW1): the cars' yellow flashes, the pedestrians' lamps are off
;   MCLR          : reset (SW0)
; The phases, as the FPGA's state diagram's: 0 CARS, 1 CARS_YELLOW, 2 ALL_RED, 3 WALK, 4 WALK_END, 5 ALL_RED_2, 6 NIGHT.
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    mov #0xff00, w0          ; RA0..RA7 outputs: the LEDs
    rcall init
    clr w6                   ; no request
    clr w9                   ; the buttons held
    clr w0
    rcall enter              ; CARS
loop:
    rcall tick
    rcall buttons
    btsc w10, #6             ; S3: a request
    mov #1, w6
    btss w10, #7             ; S6: night mode on or off
    bra timed
    mov #6, w0
    cp w4, w0
    bra z, day
    rcall enter              ; NIGHT
    bra timed
day:
    clr w0
    rcall enter              ; CARS
timed:
    inc w5, w5
    rcall length             ; W0 the phase's length in ticks (0: none)
    cp0 w0
    bra z, lamps
    cp w5, w0
    bra ltu, lamps
    cp0 w4                   ; its time over: CARS waits for a request
    bra nz, next
    mov w0, w5               ; (its count kept at its length)
    cp0 w6
    bra z, lamps
next:
    add w4, #1, w0
    cp w0, #3
    bra nz, last
    clr w6                   ; WALK: the request served
last:
    cp w0, #6
    bra nz, go
    clr w0                   ; after ALL_RED_2, CARS
go:
    rcall enter
lamps:
    mov #25, w2
    repeat #17
    div.u w5, w2             ; W0 the quarters of a second in this phase
    and w0, #1, w3           ; W3 1 in the second and fourth quarter of each second: blinking off
    mov #0x22, w0            ; CARS: the cars' green, the pedestrians' red
    cp w4, #1
    bra nz, p2
    mov #0x42, w0            ; CARS_YELLOW: yellow, red
p2:
    cp w4, #2
    bra nz, p3
    mov #0x82, w0            ; ALL_RED
p3:
    cp w4, #3
    bra nz, p4
    mov #0x81, w0            ; WALK: the cars' red, the pedestrians' green
p4:
    cp w4, #4
    bra nz, p5
    mov #0x81, w0            ; WALK_END: their green blinking
    btsc w3, #0
    mov #0x80, w0
p5:
    cp w4, #5
    bra nz, p6
    mov #0x82, w0            ; ALL_RED_2
p6:
    cp w4, #6
    bra nz, lit
    mov #0x40, w0            ; NIGHT: the cars' yellow flashing, the pedestrians' lamps off
    btsc w3, #0
    clr w0
lit:
    mov w0, 0x0666           ; LATA
    rcall left
    bra loop
; enter: the phase W0 started (its count 0), its name on the first row
enter:
    mov w0, w4
    clr w5
    mov #99, w7              ; (the seconds left not shown yet)
    mov #0x80, w0
    rcall cmd
    cp w4, #0
    bra nz, n1
    mov #0x43, w0            ; 'C'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x67, w0            ; 'g'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x65, w0            ; 'e'
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
    return
n1:
    cp w4, #1
    bra nz, n2
    mov #0x43, w0            ; 'C'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x79, w0            ; 'y'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x77, w0            ; 'w'
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
n2:
    cp w4, #3
    bra nz, n4
    mov #0x57, w0            ; 'W'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x6b, w0            ; 'k'
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
    return
n4:
    cp w4, #4
    bra nz, n6
    mov #0x57, w0            ; 'W'
    rcall chr
    mov #0x61, w0            ; 'a'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x6b, w0            ; 'k'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x68, w0            ; 'h'
    rcall chr
    mov #0x75, w0            ; 'u'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x79, w0            ; 'y'
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
    return
n6:
    cp w4, #6
    bra nz, n5
    mov #0x4e, w0            ; 'N'
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
    return
n5:
    mov #0x41, w0            ; 'A'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x6c, w0            ; 'l'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x65, w0            ; 'e'
    rcall chr
    mov #0x64, w0            ; 'd'
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
    return
; length: W0 the length of the phase W4, in ticks of 10 ms (0: NIGHT's, none)
length:
    mov #500, w0             ; CARS: at least 5 s; WALK: 5 s
    cp w4, #1
    bra nz, l2
    mov #200, w0             ; CARS_YELLOW: 2 s
l2:
    cp w4, #2
    bra nz, l4
    mov #100, w0             ; ALL_RED: 1 s
l4:
    cp w4, #4
    bra nz, l5
    mov #300, w0             ; WALK_END: 3 s
l5:
    cp w4, #5
    bra nz, l6
    mov #100, w0             ; ALL_RED_2: 1 s
l6:
    cp w4, #6
    bra nz, l7
    clr w0                   ; NIGHT: none
l7:
    return
; left: the seconds left to cross on the second row (WALK: 8 to 4, WALK_END: 3 to 1; blank otherwise), when they change
left:
    mov #100, w2
    repeat #17
    div.u w5, w2             ; W0 the seconds of this phase
    mov #8, w3
    cp w4, #3
    bra z, minus
    mov #3, w3
    cp w4, #4
    bra z, minus
    clr w0                   ; no seconds left: blank
    bra shown
minus:
    sub w3, w0, w0
shown:
    cp w0, w7
    bra nz, draw
    return
draw:
    mov w0, w7
    mov #0xc0, w0
    rcall cmd
    cp0 w7
    bra z, blank
    mov #0x43, w0            ; 'C'
    rcall chr
    mov #0x72, w0            ; 'r'
    rcall chr
    mov #0x6f, w0            ; 'o'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x73, w0            ; 's'
    rcall chr
    mov #0x3a, w0            ; ':'
    rcall chr
    mov #0x20, w0            ; ' '
    rcall chr
    mov w7, w0
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
    return
blank:
    mov #16, w3
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
