// Silinx - a MicroPython node's network, behavioural (#5500, docs/SYSTEMS.md): Silinx's own `network` (a WLAN that
// connects at once) and `umqtt.simple` (MicroPython's MQTT client's API: connect, publish, subscribe, set_callback,
// check_msg, wait_msg, disconnect), put into its sys.modules before its program runs. A message goes out as a
// frame on the node's USB serial port (its REPL's: RS, its JSON, LF), which the node's adapter takes off its console and
// puts on its network link (core/system-mqtt.js); the broker's come back as frames typed to it, read from sys.stdin.
// The same program runs on a real board with MicroPython's own modules (a Pico W, an ESP32).
//
// Isomorphic ES module, no DOM, no imports.

/** A frame's first byte (ASCII RS) and its end (LF). */
export const FRAME_START = 0x1e;
export const FRAME_END = 0x0a;

/** The frame of a message: RS, its JSON, LF (as text). */
export const frameText = message => `\x1e${JSON.stringify(message)}\n`;

const NETWORK = `# Silinx's network (behavioural): a WLAN that connects at once, its traffic the System's network link
STA_IF = 0
AP_IF = 1
STAT_GOT_IP = 3
class WLAN:
    def __init__(self, interface=STA_IF):
        self._on = False
        self._ok = False
    def active(self, on=None):
        if on is None:
            return self._on
        self._on = bool(on)
    def connect(self, ssid=None, key=None, *args, **kw):
        self._ok = True
    def disconnect(self):
        self._ok = False
    def isconnected(self):
        return self._ok
    def status(self, *args):
        return STAT_GOT_IP if self._ok else 0
    def ifconfig(self, *args):
        return ('192.0.2.2', '255.255.255.0', '192.0.2.1', '192.0.2.1')
`;

const UMQTT = `# Silinx's umqtt.simple (behavioural, QoS 0): MicroPython's MQTT client over the System's network link
import sys, json, select
_poll = select.poll()
_poll.register(sys.stdin, select.POLLIN)
def _send(m):
    sys.stdout.write('\\x1e' + json.dumps(m) + '\\n')
def _recv(ms):
    if not _poll.poll(ms):
        return None
    line = sys.stdin.readline()
    i = line.find('\\x1e')
    return json.loads(line[i + 1:]) if i >= 0 else None
def _s(x):
    return x.decode() if isinstance(x, bytes) else str(x)
class MQTTException(Exception):
    pass
class MQTTClient:
    def __init__(self, client_id, server, port=0, user=None, password=None, keepalive=0, ssl=False, ssl_params={}):
        self.client_id = _s(client_id)
        self.server = server
        self.cb = None
        self._q = []
    def set_callback(self, f):
        self.cb = f
    def connect(self, clean_session=True, timeout=None):
        _send({'type': 'connect', 'client': self.client_id})
        while True:
            m = _recv(1000)
            if m is None:
                raise MQTTException('no broker answered')
            if m['type'] == 'connack':
                return False
            self._q.append(m)
    def disconnect(self):
        _send({'type': 'disconnect'})
    def ping(self):
        pass
    def publish(self, topic, msg, retain=False, qos=0):
        _send({'type': 'publish', 'topic': _s(topic), 'payload': _s(msg), 'retain': bool(retain)})
    def subscribe(self, topic, qos=0):
        _send({'type': 'subscribe', 'topic': _s(topic)})
    def _deliver(self, m):
        if m and m['type'] == 'message' and self.cb:
            self.cb(m['topic'].encode(), str(m['payload']).encode())
            return True
        return False
    def wait_msg(self):
        while True:
            if self._deliver(self._q.pop(0) if self._q else _recv(-1)):
                return None
    def check_msg(self, attempts=2):
        self._deliver(self._q.pop(0) if self._q else _recv(0))
`;

/** The Python run before the program (its own raw REPL's exec): the modules put into sys.modules (no file system: the
 *  node's flash is not formatted), as `import network` and `from umqtt.simple import MQTTClient` find them. */
export const NETWORK_SETUP = [
  'import sys',
  'class _SilinxModule:', '    pass',
  'def _silinx_module(name, src):',
  '    d = {"__name__": name}',
  '    exec(src, d)',
  '    m = _SilinxModule()',
  '    for k in d:', '        setattr(m, k, d[k])',
  '    sys.modules[name] = m',
  '    return m',
  `_silinx_module("network", ${JSON.stringify(NETWORK)})`,
  `_silinx_module("umqtt", "").simple = _silinx_module("umqtt.simple", ${JSON.stringify(UMQTT)})`,
  '',
].join('\n');
