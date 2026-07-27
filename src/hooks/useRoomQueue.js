import { useEffect, useState, useCallback } from 'react';
import {
  ref, onValue, push, remove, set, serverTimestamp,
} from 'firebase/database';
import { db } from '../services/firebase';

/**
 * useRoomQueue(roomId, { uid, name })
 *
 * Returns { items, add, removeItem, shuffle, clear }.
 * `items` is an array sorted by addedAt ascending, each { key, videoId, title, thumbnail, addedByUid, addedByName, addedAt }.
 */
export function useRoomQueue(roomId, { uid, name, isHost } = {}) {
  const [raw, setRaw] = useState({});

  useEffect(() => {
    if (!roomId) return;
    const off = onValue(ref(db, `rooms/${roomId}/queue`), (s) => {
      setRaw(s.val() || {});
    });
    return off;
  }, [roomId]);

  const items = Object.entries(raw)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

  const add = useCallback(async (meta) => {
    if (!roomId || !uid || !meta?.videoId) return;
    const item = {
      videoId: meta.videoId,
      title: meta.title || meta.videoId,
      thumbnail: meta.thumbnail || `https://i.ytimg.com/vi/${meta.videoId}/mqdefault.jpg`,
      addedByUid: uid,
      addedByName: name || 'anon',
      addedAt: serverTimestamp(),
    };
    await push(ref(db, `rooms/${roomId}/queue`), item);
    set(ref(db, `rooms/${roomId}/meta/lastActivity`), serverTimestamp()).catch(() => {});
  }, [roomId, uid, name]);

  const removeItem = useCallback(async (key) => {
    if (!roomId || !key) return;
    await remove(ref(db, `rooms/${roomId}/queue/${key}`));
  }, [roomId]);

  const shuffle = useCallback(async () => {
    if (!roomId || !isHost) return;
    const arr = items.slice();
    // Fisher–Yates
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Rewrite with fresh addedAt stamps preserving new order.
    const now = Date.now();
    const next = {};
    arr.forEach((it, idx) => {
      next[it.key] = {
        videoId: it.videoId,
        title: it.title,
        thumbnail: it.thumbnail,
        addedByUid: it.addedByUid,
        addedByName: it.addedByName,
        addedAt: now + idx, // preserves order; server stamp not needed for reorder
      };
    });
    await set(ref(db, `rooms/${roomId}/queue`), next);
  }, [roomId, isHost, items]);

  const clear = useCallback(async () => {
    if (!roomId || !isHost) return;
    await set(ref(db, `rooms/${roomId}/queue`), null);
  }, [roomId, isHost]);

  return { items, add, removeItem, shuffle, clear };
}
