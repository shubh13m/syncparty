import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue, set, serverTimestamp } from 'firebase/database';
import { db, correctedNow } from '../services/firebase';
import { loadYouTubeAPI } from '../services/youtubeApi';
import { expectedTime, shouldSeek, PLAYER_STATE } from '../utils/syncMath';

/**
 * useYouTubePlayer({ roomId, isHost, containerRef })
 *
 * containerRef: a React ref pointing to an empty <div> the hook can populate.
 * The hook creates a fresh child element inside it each mount (YouTube API
 * REPLACES its mount target with an <iframe>, so we can't reuse the same
 * DOM node across mounts — critical for React StrictMode compatibility).
 *
 * Returns { playback, localState, videoError, ready, muted, unmute, resync, hostControls }.
 */
export function useYouTubePlayer({ roomId, isHost, containerRef }) {
  const [playback, setPlayback] = useState(null);
  const [localState, setLocalState] = useState(PLAYER_STATE.UNSTARTED);
  const [videoError, setVideoError] = useState(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);

  const playerRef = useRef(null);
  const playbackRef = useRef(null);
  const suppressPublishRef = useRef(false);
  const currentVideoIdRef = useRef(null);
  const isHostRef = useRef(isHost);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { playbackRef.current = playback; }, [playback]);

  // Mount the player. We do this once, keyed off roomId.
  useEffect(() => {
    let cancelled = false;
    let player = null;
    let mountEl = null;

    (async () => {
      const YT = await loadYouTubeAPI();
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      // Clean any leftover children (StrictMode second mount).
      container.innerHTML = '';
      mountEl = document.createElement('div');
      mountEl.style.width = '100%';
      mountEl.style.height = '100%';
      container.appendChild(mountEl);

      player = new YT.Player(mountEl, {
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          // Start muted so autoplay works in all browsers.
          mute: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
            setVideoError(null);
            console.log('[player] onReady fired, isHost=', isHostRef.current);
          },
          onStateChange: (e) => {
            setLocalState(e.data);
            if (!isHostRef.current) return;
            if (suppressPublishRef.current) return;
            publishHostState(e.data);
          },
          onError: (e) => {
            const map = {
              2: 'Invalid video ID',
              5: 'Playback error — try another video or refresh',
              100: 'Video not found or private',
              101: 'Video cannot be embedded',
              150: 'Video cannot be embedded',
            };
            setVideoError(map[e.data] || `YouTube error ${e.data}`);
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      try { player?.destroy?.(); } catch {}
      playerRef.current = null;
      setReady(false);
      if (mountEl && mountEl.parentNode) {
        try { mountEl.parentNode.removeChild(mountEl); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Subscribe to /playback.
  useEffect(() => {
    if (!roomId) return;
    const off = onValue(ref(db, `rooms/${roomId}/playback`), (s) => {
      const val = s.val();
      console.log('[player] /playback update', val);
      setPlayback(val);
    });
    return off;
  }, [roomId]);

  // React to /playback changes.
  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p || !playback) {
      console.log('[player] effect skip', { ready, hasPlayer: !!p, hasPlayback: !!playback });
      return;
    }
    const { videoId, state } = playback;
    if (!videoId) return;

    if (videoId !== currentVideoIdRef.current) {
      console.log('[player] loading videoId', videoId, 'startState=', state);
      currentVideoIdRef.current = videoId;
      suppressPublishRef.current = true;
      const startAt = expectedTime(playback, correctedNow());
      try {
        if (state === PLAYER_STATE.PLAYING) {
          p.loadVideoById({ videoId, startSeconds: Math.max(0, startAt) });
          // Some browsers hesitate on iframe autoplay; force it once loaded.
          setTimeout(() => {
            try {
              p.playVideo();
              console.log('[player] forced playVideo after load');
            } catch (e) {
              console.warn('[player] forced playVideo failed', e);
            }
          }, 400);
        } else {
          p.cueVideoById({ videoId, startSeconds: Math.max(0, startAt) });
        }
      } catch (err) {
        console.error('[player] load failed', err);
      }
      setTimeout(() => (suppressPublishRef.current = false), 900);
      return;
    }

    if (isHost) return;
    applyDriftCorrection(p, playback);
  }, [playback, ready, isHost]);

  // Periodic drift check for joiners.
  useEffect(() => {
    if (isHost) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || !playbackRef.current) return;
      applyDriftCorrection(p, playbackRef.current);
    }, 3000);
    return () => clearInterval(id);
  }, [isHost]);

  const publishHostState = async (state) => {
    const p = playerRef.current;
    if (!p) return;
    const videoId = currentVideoIdRef.current;
    if (!videoId) return;
    if (![PLAYER_STATE.PLAYING, PLAYER_STATE.PAUSED, PLAYER_STATE.ENDED].includes(state)) return;
    let currentTime = 0;
    try { currentTime = p.getCurrentTime() || 0; } catch {}
    try {
      await set(ref(db, `rooms/${roomId}/playback`), {
        videoId,
        state,
        currentTime,
        updatedAt: serverTimestamp(),
      });
      set(ref(db, `rooms/${roomId}/meta/lastActivity`), serverTimestamp()).catch(() => {});
    } catch (err) {
      console.warn('[player] publish failed', err);
    }
  };

  const applyDriftCorrection = (p, snapshot) => {
    if (!snapshot || !snapshot.videoId) return;
    const local = safeGetCurrentTime(p);
    const expected = expectedTime(snapshot, correctedNow());
    const localSt = safeGetPlayerState(p);
    if (snapshot.state === PLAYER_STATE.PLAYING && localSt === PLAYER_STATE.PAUSED) {
      try { p.playVideo(); } catch {}
    } else if (snapshot.state === PLAYER_STATE.PAUSED && localSt === PLAYER_STATE.PLAYING) {
      try { p.pauseVideo(); } catch {}
    }
    if (shouldSeek(local, expected, localSt)) {
      try {
        suppressPublishRef.current = true;
        p.seekTo(Math.max(0, expected), true);
        setTimeout(() => (suppressPublishRef.current = false), 500);
      } catch {}
    }
  };

  const resync = useCallback(() => {
    const p = playerRef.current;
    if (!p || !playbackRef.current) {
      console.warn('[player] resync skipped: no player or playback', { hasPlayer: !!p, hasPlayback: !!playbackRef.current });
      return;
    }
    const expected = expectedTime(playbackRef.current, correctedNow());
    console.log('[player] resync -> seekTo', expected);
    try {
      suppressPublishRef.current = true;
      p.seekTo(Math.max(0, expected), true);
      if (playbackRef.current.state === PLAYER_STATE.PLAYING) {
        p.playVideo();
      }
      setTimeout(() => (suppressPublishRef.current = false), 500);
    } catch (err) {
      console.error('[player] resync failed', err);
    }
  }, []);

  const unmute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.unMute();
      p.setVolume(80);
      setMuted(false);
    } catch {}
  }, []);

  const hostControls = {
    loadVideo: async (videoId) => {
      if (!videoId) return;
      console.log('[player] host loadVideo', videoId, 'roomId=', roomId);
      setVideoError(null);
      try {
        await set(ref(db, `rooms/${roomId}/playback`), {
          videoId,
          state: PLAYER_STATE.PLAYING,
          currentTime: 0,
          updatedAt: serverTimestamp(),
        });
        console.log('[player] published playback ok');
        // Also kick off local playback explicitly (autoplay is unreliable).
        setTimeout(() => {
          try {
            playerRef.current?.playVideo();
            console.log('[player] host forced local playVideo');
          } catch (e) {
            console.warn('[player] host forced playVideo failed', e);
          }
        }, 600);
      } catch (err) {
        console.error('[player] loadVideo publish FAILED', err);
        setVideoError(`Publish failed: ${err.code || err.message}`);
      }
    },
    play: () => {
      try {
        playerRef.current?.playVideo();
        console.log('[player] host play()');
      } catch (e) { console.warn('[player] play failed', e); }
    },
    pause: () => {
      try {
        playerRef.current?.pauseVideo();
        console.log('[player] host pause()');
      } catch (e) { console.warn('[player] pause failed', e); }
    },
    seek: (seconds) => {
      try { playerRef.current?.seekTo(seconds, true); } catch {}
    },
  };

  return { playback, localState, videoError, ready, muted, unmute, resync, hostControls };
}

function safeGetCurrentTime(p) {
  try { return p.getCurrentTime() || 0; } catch { return 0; }
}
function safeGetPlayerState(p) {
  try { return p.getPlayerState(); } catch { return PLAYER_STATE.UNSTARTED; }
}
