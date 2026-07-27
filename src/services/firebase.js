import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Server time offset in ms (correctedNow = Date.now() + serverTimeOffset)
let serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
  serverTimeOffset = snap.val() || 0;
});
export const getServerTimeOffset = () => serverTimeOffset;
export const correctedNow = () => Date.now() + serverTimeOffset;

// Anonymous auth bootstrap — resolves once a UID is available.
let authReadyPromise = null;
export function waitForAuth() {
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user);
        }
      },
      reject
    );
    signInAnonymously(auth).catch(reject);
  });
  return authReadyPromise;
}
