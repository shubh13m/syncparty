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
