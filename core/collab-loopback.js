// WebRTC between two browsers of one computer (#4494): each browser hides its host address behind an mDNS name
// (`<uuid>.local`) that another browser does not resolve, the public address (STUN's) needs the router to loop it back,
// and a browser without macOS's Local Network permission cannot reach the computer's own address; loopback is exempt
// from all three. So a remote host candidate at an mDNS name gets a twin at 127.0.0.1, on the same port, beside it
// (never instead of it: peers on two computers connect as before), a few at most. Used by the meeting point's
// connections and the codes' (web/js/collab-meet.js, web/js/collab-rtc.js).
// A twin makes this browser send ICE's connectivity checks (STUN binding requests) to a port of its own computer that
// the peer named. So, kept narrow: UDP only, an mDNS host candidate only (a browser's own, hiding its address: the same
// computer or network), a port of 1024 or more (a browser's ephemeral one, never a well-known service's), eight at most.
// What is sent is a STUN request with the session's ICE credentials, which only that peer's connection answers; a peer
// could name 127.0.0.1 in its description itself (SECURITY.md, Live sharing).
//   loopbackSdp(sdp) -> the description with its mDNS host candidates' twins
//   loopbackCandidate(candidate) -> a trickled candidate's twin (RTCIceCandidateInit), or null
//   withLoopback(PC) -> a connection class whose remote descriptions and candidates get their twins

export const LOOPBACK = '127.0.0.1';
/** Twins in one description at most. */
export const MAX_TWINS = 8;
/** The lowest port a twin takes (below it: the well-known services'). */
export const MIN_PORT = 1024;

// a candidate's attribute: candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> …
const CANDIDATE = /^(a=)?candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)(.*)$/;
const MDNS = /^[A-Za-z0-9-]{1,63}\.local$/i;

// a candidate line's twin (with or without its `a=`), or null: a UDP host candidate's at an mDNS name and a port of
// MIN_PORT or more
function twin(line) {
  const m = CANDIDATE.exec(line);
  if (!m || m[8] !== 'host' || m[4].toLowerCase() !== 'udp' || !MDNS.test(m[6]) || +m[7] < MIN_PORT || +m[7] > 65535) return null;
  return `${m[1] || ''}candidate:${`L${m[2]}`.slice(0, 32)} ${m[3]} ${m[4]} ${m[5]} ${LOOPBACK} ${m[7]} typ host${m[9]}`;
}

/** A session description with a twin at 127.0.0.1 after each mDNS host candidate (MAX_TWINS at most). */
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
