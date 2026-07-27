import { useEffect, useState, useRef } from 'react';
import {
  ref,
  onValue,
  onDisconnect,
  set,
  update,
  get,
  remove,
  serverTimestamp,
  runTransaction,
} from 'firebase/database';
import { db, waitForAuth } from '../services/firebase';
import { addRecentRoom } from '../utils/recentRooms';
import { sweepIdleRooms } from '../utils/roomCleanup';

/**
 * useRoom(roomId, { name, color })
 *
 * Handles the full lifecycle of joining a room:
 *   - Waits for anon auth.
 *   - Sweeps idle rooms opportunistically.
 *   - Checks kicked list; if kicked, sets `kicked = true` and stops.
 *   - Creates the room if it doesn't exist (caller becomes host).
 *   - Writes presence at /users/{uid} with onDisconnect().remove().
 *   - Bumps /meta/lastActivity on join.
 *   - Subscribes to /users, /meta, /kicked.
 *   - If host disappears from /users, promotes oldest remaining user
 *     via runTransaction on /meta/hostId. If nobody remains, deletes room.
 *
 * Returns { ready, uid, hostId, isHost, users, meta, kicked, error, leave }.
 */
export function useRoom(roomId, { name, color }) {
  const [uid, setUid] = useState(null);
  const [meta, setMeta] = useState(null);
  const [users, setUsers] = useState({});
  const [kicked, setKicked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const leftRef = useRef(false);
  const sawMetaRef = useRef(false);

  useEffect(() => {
    if (!roomId) return;
    let unsubs = [];
    let cancelled = false;

    (async () => {
      try {
        const user = await waitForAuth();
        if (cancelled) return;
        setUid(user.uid);

        // Fire-and-forget idle sweep (never blocks join)
        sweepIdleRooms();

        const roomRef = ref(db, `rooms/${roomId}`);
        const metaRef = ref(db, `rooms/${roomId}/meta`);
        const usersRef = ref(db, `rooms/${roomId}/users`);
        const kickedMeRef = ref(db, `rooms/${roomId}/kicked/${user.uid}`);
        const myUserRef = ref(db, `rooms/${roomId}/users/${user.uid}`);

        // 1. Am I already kicked?
        const kickedSnap = await get(kickedMeRef);
        if (kickedSnap.exists()) {
          setKicked(true);
          setReady(true);
          return;
        }

        // 2. Does room exist? If not, create it and become host.
        const roomSnap = await get(roomRef);
        if (!roomSnap.exists()) {
          await set(roomRef, {
            meta: {
              hostId: user.uid,
              createdAt: serverTimestamp(),
              lastActivity: serverTimestamp(),
            },
            users: {
              [user.uid]: {
                name,
                color,
                joinedAt: serverTimestamp(),
              },
            },
          });
        } else {
          // 3. Join existing room.
          await set(myUserRef, {
            name,
            color,
            joinedAt: serverTimestamp(),
          });
          await update(metaRef, { lastActivity: serverTimestamp() });
        }

        // 4. Presence cleanup on disconnect
        onDisconnect(myUserRef).remove();

        // 5. Remember in localStorage
        addRecentRoom(roomId);

        // 6. Subscribe to meta / users / kicked
        const offMeta = onValue(metaRef, (s) => {
          const v = s.val();
          if (v) {
            sawMetaRef.current = true;
            setMeta(v);
          } else if (sawMetaRef.current && !leftRef.current) {
            // Meta existed before and is now gone → room was ended.
            setEnded(true);
            setMeta(null);
          } else {
            setMeta(null);
          }
        });
        const offUsers = onValue(usersRef, (s) => setUsers(s.val() || {}));
        const offKicked = onValue(kickedMeRef, (s) => {
          if (s.exists()) setKicked(true);
        });
        unsubs.push(offMeta, offUsers, offKicked);

        setReady(true);
      } catch (e) {
        console.error('[useRoom] join failed', e);
        setError(e);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }, [roomId, name, color]);

  // Host-left promotion: if hostId no longer in users, promote oldest.
  useEffect(() => {
    if (!meta?.hostId || !uid) return;
    const userIds = Object.keys(users);
    if (userIds.length === 0) return;

    const hostPresent = users[meta.hostId];
    if (hostPresent) return; // Host still here, do nothing.

    // Only the "oldest remaining user" attempts the transaction to reduce
    // contention. Ties broken by uid lex order for determinism.
    const oldest = userIds
      .map((id) => ({ id, joinedAt: users[id]?.joinedAt || 0 }))
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];

    if (oldest.id !== uid) return;

    const hostIdRef = ref(db, `rooms/${roomId}/meta/hostId`);
    runTransaction(hostIdRef, (currentHostId) => {
      // If someone else already fixed it, or if the current host is now present,
      // abort by returning undefined.
      if (currentHostId && users[currentHostId]) return;
      return uid;
    }).catch((e) => console.warn('[useRoom] host promotion failed', e));
  }, [meta?.hostId, users, uid, roomId]);

  // If the room becomes truly empty (no users), delete it.
  // Guarded so we only try when we ourselves are leaving.
  useEffect(() => {
    if (!ready || !uid) return;
    const otherUsers = Object.keys(users).filter((id) => id !== uid);
    if (otherUsers.length === 0 && leftRef.current) {
      remove(ref(db, `rooms/${roomId}`)).catch(() => {});
    }
  }, [users, uid, ready, roomId]);

  const leave = async () => {
    if (!uid || leftRef.current) return;
    leftRef.current = true;
    try {
      await remove(ref(db, `rooms/${roomId}/users/${uid}`));
      // If we were the last one, delete the whole room.
      const snap = await get(ref(db, `rooms/${roomId}/users`));
      if (!snap.exists()) {
        await remove(ref(db, `rooms/${roomId}`));
      }
    } catch (e) {
      console.warn('[useRoom] leave failed', e);
    }
  };

  // Host-only: kick a user. Writes /kicked/{uid}=true then removes /users/{uid}.
  const kickUser = async (targetUid) => {
    if (!targetUid || targetUid === uid) return;
    if (!meta || meta.hostId !== uid) return;
    try {
      await set(ref(db, `rooms/${roomId}/kicked/${targetUid}`), true);
      await remove(ref(db, `rooms/${roomId}/users/${targetUid}`));
      await update(ref(db, `rooms/${roomId}/meta`), { lastActivity: serverTimestamp() });
    } catch (e) {
      console.warn('[useRoom] kick failed', e);
    }
  };

  // Host-only: delete the entire room. Everyone still connected will see `ended`.
  const endRoom = async () => {
    if (!meta || meta.hostId !== uid) return;
    leftRef.current = true;
    try {
      await remove(ref(db, `rooms/${roomId}`));
    } catch (e) {
      console.warn('[useRoom] endRoom failed', e);
    }
  };

  return {
    ready,
    uid,
    hostId: meta?.hostId || null,
    isHost: !!(uid && meta?.hostId === uid),
    users,
    meta,
    kicked,
    ended,
    error,
    leave,
    kickUser,
    endRoom,
  };
}
