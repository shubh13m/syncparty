import { useState } from 'react';

export function QueuePanel({ items, currentVideoId, isHost, uid, onPlayNow, onRemove, onShuffle, onClear }) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {items.length === 0 ? 'Queue is empty' : `${items.length} in queue`}
        </div>
        {isHost && items.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={onShuffle}
              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
              title="Shuffle queue"
            >
              🔀
            </button>
            <button
              onClick={() => {
                if (confirmClear) { onClear(); setConfirmClear(false); }
                else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }
              }}
              className={`text-xs px-2 py-1 rounded ${confirmClear ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-700 hover:bg-slate-600'}`}
              title="Clear queue"
            >
              {confirmClear ? 'Confirm?' : '🗑'}
            </button>
          </div>
        )}
      </div>
      <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {items.map((it) => {
          const isCurrent = it.videoId === currentVideoId;
          const canRemove = isHost || it.addedByUid === uid;
          return (
            <li
              key={it.key}
              className={`flex gap-2 p-2 rounded-lg ${isCurrent ? 'bg-brand-accent/20 ring-1 ring-brand-accent/50' : 'bg-brand-bg/60 hover:bg-brand-bg'}`}
            >
              <img src={it.thumbnail} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-200 line-clamp-2 leading-tight" title={it.title}>{it.title}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  by {it.addedByName || 'anon'}
                  {isCurrent && <span className="ml-1 text-brand-accent2">· now playing</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {isHost && !isCurrent && (
                  <button
                    onClick={() => onPlayNow(it)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-brand-accent hover:bg-brand-accent/90"
                    title="Play now"
                  >
                    ▶
                  </button>
                )}
                {canRemove && !isCurrent && (
                  <button
                    onClick={() => onRemove(it.key)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-red-600"
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
