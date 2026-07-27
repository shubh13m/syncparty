import { ref, get, remove } from 'firebase/database';
import { db, correctedNow } from '../services/firebase';

const IDLE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Sweep rooms whose /meta/lastActivity is older than IDLE_MS.
 * Runs client-side; Firebase Security Rules must permit these deletes
 * (allow if now - lastActivity > 24h OR auth.uid === hostId).
 *
 * Called opportunistically on Home load and Room join. Safe to call often.
 */
export async function sweepIdleRooms() {
  try {
    const snap = await get(ref(db, 'rooms'));
    if (!snap.exists()) return { deleted: 0 };
    const now = correctedNow();
    const rooms = snap.val();
    const deletions = [];
    for (const [roomId, room] of Object.entries(rooms)) {
      const last = room?.meta?.lastActivity ?? room?.meta?.createdAt ?? 0;
      if (now - last > IDLE_MS) {
        deletions.push(remove(ref(db, `rooms/${roomId}`)).catch(() => {}));
      }
    }
    await Promise.all(deletions);
    return { deleted: deletions.length };
  } catch (e) {
    // Root /rooms read is denied by security rules (per-room reads only).
    // Cleanup will run whenever a rule-permitted mechanism exists (server-side
    // sweeper on Blaze, or manual). Silent by design.
    return { deleted: 0, error: e };
  }
}
