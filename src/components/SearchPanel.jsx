import { useEffect, useRef, useState } from 'react';
import { searchYouTube, getSearchQuotaState, isSearchConfigured, fetchVideoMeta } from '../services/youtubeApi';
import { parseYouTubeId } from '../utils/youtubeUrl';

/**
 * SearchPanel — search YouTube (Data API) or paste a URL/ID to add to queue.
 *
 * Props: { onAdd(meta), onPlayNow?(meta), isHost }
 * meta = { videoId, title, thumbnail }
 */
export function SearchPanel({ onAdd, onPlayNow, isHost }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [quotaOut, setQuotaOut] = useState(() => getSearchQuotaState().blocked);
  const searchable = isSearchConfigured() && !quotaOut;
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');

  // Debounced search.
  useEffect(() => {
    const query = q.trim();
    lastQueryRef.current = query;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || !searchable) {
      setResults([]);
      setLoading(false);
      return;
    }
    // If the input parses as a URL/ID, don't burn quota on search.
    if (parseYouTubeId(query)) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { results: r, quotaExhausted, error } = await searchYouTube(query);
      // Ignore stale results.
      if (lastQueryRef.current !== query) return;
      setLoading(false);
      if (quotaExhausted) { setQuotaOut(true); setResults([]); setErr(''); return; }
      if (error) { setErr(error); setResults([]); return; }
      setErr('');
      setResults(r);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [q, searchable]);

  const submitPaste = async (e) => {
    e.preventDefault();
    const id = parseYouTubeId(q.trim());
    if (!id) { setErr('Enter a search or a valid YouTube link'); return; }
    setErr('');
    const meta = await fetchVideoMeta(id);
    const item = {
      videoId: id,
      title: meta?.title || id,
      thumbnail: meta?.thumbnail_url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    };
    onAdd(item);
    setQ('');
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <form onSubmit={submitPaste} className="flex gap-1.5">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchable ? 'Search YouTube or paste link' : 'Paste a YouTube link'}
          className="flex-1 bg-brand-bg border border-slate-700 focus:border-brand-accent outline-none rounded-lg px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-sm"
          title="Add pasted link"
        >
          Add
        </button>
      </form>
      {!isSearchConfigured() && (
        <div className="text-[10px] text-slate-500">Search disabled (no API key). Paste a link instead.</div>
      )}
      {quotaOut && (
        <div className="text-[10px] text-amber-400">Search quota reached — paste a link instead. Resets tomorrow.</div>
      )}
      {err && <div className="text-[10px] text-red-400">{err}</div>}
      {loading && <div className="text-[10px] text-slate-500">Searching…</div>}
      {results.length > 0 && (
        <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
          {results.map((r) => (
            <li key={r.videoId} className="flex gap-2 p-1.5 rounded-lg bg-brand-bg/60 hover:bg-brand-bg">
              <img src={r.thumbnail} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-200 line-clamp-2 leading-tight" title={r.title}>{r.title}</div>
                <div className="text-[10px] text-slate-500 truncate">{r.channel}</div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  onClick={() => { onAdd(r); }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600"
                  title="Add to queue"
                >
                  +
                </button>
                {isHost && onPlayNow && (
                  <button
                    onClick={() => onPlayNow(r)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-brand-accent hover:bg-brand-accent/90"
                    title="Play now"
                  >
                    ▶
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
