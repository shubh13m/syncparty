import { useEffect, useState } from 'react';
import { waitForAuth } from '../services/firebase';
import { generateGuestName } from '../utils/random';
import { colorForKey } from '../utils/colors';

const NAME_KEY = 'syncparty:name';

export function useUserSession() {
  const [uid, setUid] = useState(null);
  const [name, setNameState] = useState(() => {
    return localStorage.getItem(NAME_KEY) || generateGuestName();
  });

  useEffect(() => {
    localStorage.setItem(NAME_KEY, name);
  }, [name]);

  useEffect(() => {
    let mounted = true;
    waitForAuth()
      .then((user) => {
        if (mounted) setUid(user.uid);
      })
      .catch((err) => console.error('Anon auth failed', err));
    return () => {
      mounted = false;
    };
  }, []);

  return {
    uid,
    name,
    color: colorForKey(uid || name),
    setName: (n) => setNameState((n || '').trim() || generateGuestName()),
    ready: !!uid,
  };
}
