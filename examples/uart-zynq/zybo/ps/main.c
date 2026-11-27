/* The processing system's program of Digilent Zybo Z7 (Silinx, #4686): bare metal on the Cortex-A9, in its on-chip
 * memory, after Silinx's ps7_init (its clocks, its MIO). It says hello on the USB-UART at 115200 baud, then
 * blinks LD4. */
#include <stdint.h>

#define REG(a) (*(volatile uint32_t *)(a))

/* UART1: MIO 48 (TX), 49 (RX); its clock 100 MHz */
#define UART_CR    REG(0xE0001000)
#define UART_MR    REG(0xE0001004)
#define UART_BRGR  REG(0xE0001018)
#define UART_SR    REG(0xE000102C)
#define UART_FIFO  REG(0xE0001030)
#define UART_BDIV  REG(0xE0001034)
#define SR_TXFULL  (1u << 4)

/* LD4: MIO 7, a GPIO of bank 0 (the GPIO's DIRM_0, OEN_0 and DATA_0) */
#define GPIO_DATA_0 REG(0xE000A040)
#define GPIO_DIRM_0 REG(0xE000A204)
#define GPIO_OEN_0  REG(0xE000A208)
#define LED_BIT     (1u << 7)

static void uart_init(void) {
  UART_CR = 0x28;              /* TX and RX off */
  UART_MR = 0x20;              /* 8 bits, no parity, 1 stop bit */
  UART_BRGR = 124;             /* 100 MHz / (124 x 7): 115200 baud */
  UART_BDIV = 6;
  UART_CR = 0x03;              /* TX and RX reset */
  UART_CR = 0x14;              /* TX and RX on */
}

static void uart_put(char c) {
  while (UART_SR & SR_TXFULL) { }
  UART_FIFO = (uint32_t)c;
}

static void uart_puts(const char *s) {
  for (; *s; s++) { if (*s == '\n') uart_put('\r'); uart_put(*s); }
}

int main(void) {
  uart_init();
  uart_puts("Hello from the Cortex-A9 of Digilent Zybo Z7\n");
  GPIO_DIRM_0 |= LED_BIT;      /* an output */
  GPIO_OEN_0 |= LED_BIT;
  for (;;) {
    GPIO_DATA_0 ^= LED_BIT;
    for (volatile uint32_t i = 0; i < 20000000u; i++) { }
  }
}
