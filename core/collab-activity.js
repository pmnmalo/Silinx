// A shared project's owner's activity (#4002): what the owner does, not its files, for its followers to follow: by
// channel (`ui`: where the owner is, the open documents, the one in front, the page, the Design view, the task, as a
// design link's view, core/design-link.js encodeUi; `design`: the Design pane's selection and its expanded rows; and,
// in the next parts, the processes run, the simulation, the Board Emulator), each channel's latest value kept by the
// owner and sent again to a follower that joins (core/collab-client.js: KIND.activity, the owner's frames only).
// A value is JSON, its size and the channels' number capped; what a follower takes is untrusted input, checked again
// by the page that applies it (core/collab-channels.js).
/** The limits of the activity: a value's JSON (bytes), the channels. */
export const ACTIVITY_LIMITS = Object.freeze({ value: 1 << 20, channels: 16 });
const CHANNEL_RE = /^[a-z]{1,16}$/;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** A channel's value as its frame's bytes (`{ ch, v }`); throws when the channel's name or the value's size is not one. */
export function activityBytes(ch, value) {
  if (!CHANNEL_RE.test(String(ch))) throw new Error(`not an activity channel: '${String(ch).slice(0, 32)}'`);
  const bytes = enc.encode(JSON.stringify({ ch, v: value ?? null }));
  if (bytes.length > ACTIVITY_LIMITS.value) throw new Error(`the activity '${ch}' is too large (${bytes.length} bytes, at most ${ACTIVITY_LIMITS.value})`);
  return bytes;
}

/** A frame's bytes read back: { ch, v } (null: not one, or too large). */
export function activityOf(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > ACTIVITY_LIMITS.value + 64) return null;
  let m;
  try { m = JSON.parse(dec.decode(bytes)); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || !CHANNEL_RE.test(String(m.ch)) || !('v' in m)) return null;
  return { ch: m.ch, v: m.v };
}

/** The channels a participant keeps: set(ch, v) (false: unchanged, or past the channels' number), get(ch), all(). */
export function activityStore(limits = ACTIVITY_LIMITS) {
  const map = new Map(), text = new Map();
  return {
    set(ch, v) {
      const t = JSON.stringify(v ?? null);
      if (text.get(ch) === t) return false;
      if (!map.has(ch) && map.size >= limits.channels) return false;
      text.set(ch, t);
      map.set(ch, v ?? null);
      return true;
    },
    get: ch => (map.has(ch) ? map.get(ch) : null),
    all: () => [...map],
  };
}
