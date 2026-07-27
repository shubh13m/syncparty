// Lazy loader for the YouTube IFrame API + oEmbed metadata helper.

let ytPromise = null;

export function loadYouTubeAPI() {
  if (ytPromise) return ytPromise;

  ytPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') {
        try { prev(); } catch {}
      }
      resolve(window.YT);
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });

  return ytPromise;
}

// oEmbed: no key, no quota. Returns { title, author_name, thumbnail_url } or null.
export async function fetchVideoMeta(videoId) {
  if (!videoId) return null;
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---- YouTube Data API v3 search ----

const QUOTA_KEY = 'syncparty:ytSearchQuota';
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

// Returns { blocked: boolean, until: number|null } — blocked until UTC midnight after 403.
export function getSearchQuotaState() {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (!raw) return { blocked: false, until: null };
    const parsed = JSON.parse(raw);
    if (!parsed?.until || Date.now() > parsed.until) {
      localStorage.removeItem(QUOTA_KEY);
      return { blocked: false, until: null };
    }
    return { blocked: true, until: parsed.until };
  } catch {
    return { blocked: false, until: null };
  }
}

function markQuotaExhausted() {
  // Block until next UTC midnight (YouTube quota resets ~00:00 Pacific but UTC is close enough).
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify({ until: d.getTime() }));
  } catch {}
}

export function isSearchConfigured() {
  return Boolean(API_KEY);
}

/**
 * searchYouTube(query) -> Promise<{ results, quotaExhausted, error }>
 * results: [{ videoId, title, channel, thumbnail }]
 */
export async function searchYouTube(q) {
  const query = String(q || '').trim();
  if (!query) return { results: [], quotaExhausted: false, error: null };
  if (!API_KEY) return { results: [], quotaExhausted: false, error: 'no-api-key' };

  const cached = getSearchQuotaState();
  if (cached.blocked) return { results: [], quotaExhausted: true, error: null };

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('q', query);
  url.searchParams.set('key', API_KEY);

  try {
    const r = await fetch(url.toString());
    if (r.status === 403) {
      markQuotaExhausted();
      return { results: [], quotaExhausted: true, error: null };
    }
    if (!r.ok) {
      return { results: [], quotaExhausted: false, error: `http-${r.status}` };
    }
    const data = await r.json();
    const results = (data.items || []).map((it) => ({
      videoId: it.id?.videoId,
      title: it.snippet?.title,
      channel: it.snippet?.channelTitle,
      thumbnail: it.snippet?.thumbnails?.medium?.url
        || it.snippet?.thumbnails?.default?.url
        || `https://i.ytimg.com/vi/${it.id?.videoId}/mqdefault.jpg`,
    })).filter((x) => x.videoId);
    return { results, quotaExhausted: false, error: null };
  } catch (err) {
    return { results: [], quotaExhausted: false, error: err.message || 'network' };
  }
}
