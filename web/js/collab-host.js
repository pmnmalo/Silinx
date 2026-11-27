// A shared project hosted by the owner's page (#3227, the browser edition, which has no server; on a server edition,
// when the owner asks for it): the room in the page (core/collab-loop.js), each follower met at the meeting point
// (collab-meet.js) when they open the link: no codes exchanged by hand any longer (#5868). Every message in the console.
//   hostRoom() -> { hosted, WebSocket }: the room of a share (collab-share.js startSharing), the owner's socket to it
//   hostSocket(link): the follower's side, the owner found at the meeting point; a WebSocket class for followRoom, or
//                   null (not found, cancelled, or a link of before the owner's key)
import { hostedRooms } from '/core/collab-loop.js';
import { collabLog } from './collab-log.js';

/** The room of a share hosted by this page, and the owner's socket to it (room: its id, #4850: the page loaded again). */
export function hostRoom(room = null) {
  const hosted = hostedRooms({ room });
  return { hosted, WebSocket: hosted.owner };
}

/** The follower's side of a room the owner's page hosts: the owner found at the meeting point (collab-meet.js), the
 *  link's owner's key telling them from the other pages; a link with no owner's key (made before it) is not followed. */
export async function hostSocket(link) {
  if (!link.host) { collabLog('ERROR: Follow a shared project: this link has no owner\'s key (it was made by an earlier Silinx): ask its owner for the link again.', 'err'); return null; }
  return (await import('./collab-meet.js')).findOwner(link);
}
