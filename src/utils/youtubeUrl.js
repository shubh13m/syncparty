// Parse a YouTube URL or raw ID into an 11-character video ID.
// Returns null if input is not recognizable.
export function parseYouTubeId(input) {
  if (!input) return null;
  const s = String(input).trim();

  // Raw 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  try {
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./, '');

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=<id>
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v');
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      // youtube.com/embed/<id> or /shorts/<id> or /v/<id>
      const m = url.pathname.match(/^\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* fall through */
  }

  return null;
}

export function youtubeThumbnail(videoId, size = 'mq') {
  return `https://i.ytimg.com/vi/${videoId}/${size}default.jpg`;
}
