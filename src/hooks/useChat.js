import { useEffect, useState, useCallback } from 'react';
import {
  ref, onValue, push, serverTimestamp, query, limitToLast,
} from 'firebase/database';
import { db } from '../services/firebase';

const MAX_MESSAGES = 100;

/**
 * useChat(roomId, { uid, name, color })
 *
 * Returns { messages, send }.
 * messages: array sorted by ts ascending, last 100 only.
 */
export function useChat(roomId, { uid, name, color } = {}) {
  const [raw, setRaw] = useState({});

  useEffect(() => {
    if (!roomId) return;
    const q = query(ref(db, `rooms/${roomId}/messages`), limitToLast(MAX_MESSAGES));
    const off = onValue(q, (s) => {
      setRaw(s.val() || {});
    });
    return off;
  }, [roomId]);

  const messages = Object.entries(raw)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const send = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!roomId || !uid || !trimmed) return;
    if (trimmed.length > 500) return;
    await push(ref(db, `rooms/${roomId}/messages`), {
      senderUid: uid,
      senderName: name || 'anon',
      senderColor: color || '#888',
      text: trimmed,
      ts: serverTimestamp(),
    });
  }, [roomId, uid, name, color]);

  return { messages, send };
}
