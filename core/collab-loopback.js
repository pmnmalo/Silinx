// WebRTC between two browsers of one computer (#4494): each browser hides its host address behind an mDNS name
// (`<uuid>.local`) that another browser does not resolve, the public address (STUN's) needs the router to loop it back,
// and a browser without macOS's Local Network permission cannot reach the computer's own address; loopback is exempt
// from all three. So every remote host candidate gets a twin at 127.0.0.1, on the same port, beside it (never instead
// of it: peers on two computers connect as before), a few at most. A peer could put 127.0.0.1 in its description itself:
// the twins let it do nothing more. Used by the meeting point's connections and the codes' (web/js/collab-meet.js,
// web/js/collab-rtc.js).
//   loopbackSdp(sdp) -> the description with its host candidates' twins
//   loopbackCandidate(candidate) -> a trickled candidate's twin (RTCIceCandidateInit), or null
//   withLoopback(PC) -> a connection class whose remote descriptions and candidates get their twins

export const LOOPBACK = '127.0.0.1';
/** Twins in one description at most. */
export const MAX_TWINS = 8;

// a candidate's attribute: candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> …
const CANDIDATE = /^(a=)?candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)(.*)$/;
const LOOP = /^(127\.|localhost$)/i;

// a candidate line's twin (with or without its `a=`), or null: a UDP host candidate's, at an IPv4 address or a name
// (an IPv6 socket, or TCP's, would not answer at 127.0.0.1), not already a loopback one
function twin(line) {
  const m = CANDIDATE.exec(line);
  if (!m || m[8] !== 'host' || m[4].toLowerCase() !== 'udp' || m[6].includes(':') || LOOP.test(m[6])) return null;
  return `${m[1] || ''}candidate:${`L${m[2]}`.slice(0, 32)} ${m[3]} ${m[4]} ${m[5]} ${LOOPBACK} ${m[7]} typ host${m[9]}`;
}

/** A session description with a twin at 127.0.0.1 after each host candidate (MAX_TWINS at most). */
export function loopbackSdp(sdp) {
  if (typeof sdp !== 'string') return sdp;
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(eol), out = [];
  const seen = new Set(lines.filter(l => CANDIDATE.test(l)));
  let n = 0;
  for (const l of lines) {
    out.push(l);
    const t = n < MAX_TWINS && l.startsWith('a=') ? twin(l) : null;
    if (t && !seen.has(t)) { seen.add(t); out.push(t); n++; }
  }
  return out.join(eol);
}

/** A trickled remote candidate's twin (RTCIceCandidateInit), or null. */
export function loopbackCandidate(c) {
  const t = typeof c?.candidate === 'string' ? twin(c.candidate) : null;
  return t ? { candidate: t, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null, ...(c.usernameFragment ? { usernameFragment: c.usernameFragment } : {}) } : null;
}

/** A WebRTC connection class (RTCPeerConnection's, or one made from it) whose remote descriptions and candidates get
 *  their twins at 127.0.0.1; a twin the connection refuses is left out. */
export function withLoopback(PC) {
  return class Loopback extends PC {
    #twins = 0;   // (the trickled candidates' twins so far)
    setRemoteDescription(d, ...rest) {
      return super.setRemoteDescription(d?.sdp ? { type: d.type, sdp: loopbackSdp(d.sdp) } : d, ...rest);
    }
    async addIceCandidate(c, ...rest) {
      await super.addIceCandidate(c, ...rest);
      const t = loopbackCandidate(c);
      if (!t || this.#twins >= MAX_TWINS) return;
      this.#twins++;
      try { await super.addIceCandidate(t); } catch { /* refused: the candidate itself stands */ }
    }
  };
}
