/* The processing system's program of the regs-zynq example (Silinx, #4688): bare metal on the Cortex-A9 of Digilent
 * Zybo Z7, after Silinx's ps7_init (its clocks, its MIO, the PL's level shifters). It drives the PL's counter through
 * its registers (cnt_regs.regs.json), on M_AXI_GP0 at 0x40000000: it clears the count, sets its period to a quarter of
 * a second of FCLK0's 50 MHz and enables it, then prints the count it reads back on the USB-UART at 115200 baud. */
#include <stdint.h>

#define REG(a) (*(volatile uint32_t *)(a))

/* the PL's registers: the map's offsets from M_AXI_GP0's base */
#define PL_BASE    0x40000000u
#define CNT_ENABLE REG(PL_BASE + 0x0)
#define CNT_PERIOD REG(PL_BASE + 0x4)
#define CNT_COUNT  REG(PL_BASE + 0x8)
#define CNT_CLEAR  REG(PL_BASE + 0xC)

/* UART1: MIO 48 (TX), 49 (RX); its clock 100 MHz */
#define UART_CR    REG(0xE0001000)
#define UART_MR    REG(0xE0001004)
#define UART_BRGR  REG(0xE0001018)
#define UART_SR    REG(0xE000102C)
#define UART_FIFO  REG(0xE0001030)
#define UART_BDIV  REG(0xE0001034)
#define SR_TXFULL  (1u << 4)

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

static void uart_putu(uint32_t n) {
  char d[10];
  int i = 0;
  do { d[i++] = (char)('0' + n % 10); n /= 10; } while (n);
  while (i) uart_put(d[--i]);
}

int main(void) {
  uart_init();
  uart_puts("The PL's counter, driven by the Cortex-A9 of Digilent Zybo Z7\n");
  CNT_CLEAR = 1;               /* the count to 0 */
  CNT_PERIOD = 12500000u;      /* a step every 0.25 s of FCLK0's 50 MHz */
  CNT_ENABLE = 1;
  for (;;) {
    for (volatile uint32_t i = 0; i < 20000000u; i++) { }
    uart_puts("count: ");
    uart_putu(CNT_COUNT);
    uart_puts("\n");
  }
}
