// The WebRTC settings of a shared project whose owner's page hosts the room (#3227, the browser edition): the STUN
// servers its meeting point's connections use (collab-meet.js), for the addresses behind a NAT. (The codes exchanged by
// hand to connect are gone, #5868: a follower finds the owner at the meeting point.)
//   iceServers() -> WebRTC's ICE servers: a public STUN server, or this browser's own list
import { prefKey } from './prefs.js';

/** The STUN servers: a public one, or this browser's own list (JSON, [] for none: a classroom's one network). */
export const STUN_KEY = prefKey('silinx.collab.stun');
export const STUN = Object.freeze(['stun:stun.l.google.com:19302']);

/** WebRTC's ICE servers: this browser's STUN list (the meeting point's too, collab-meet.js). */
export function iceServers() {
  let list = STUN;
  try { const v = localStorage.getItem(STUN_KEY); if (v !== null) list = JSON.parse(v); } catch { /* the public one */ }
  return Array.isArray(list) && list.length ? [{ urls: list.map(String) }] : [];
}
