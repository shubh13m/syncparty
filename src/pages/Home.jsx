import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSession } from '../hooks/useUserSession';
import { generateRoomId } from '../utils/random';
import { getRecentRooms, removeRecentRoom } from '../utils/recentRooms';
import { sweepIdleRooms } from '../utils/roomCleanup';
import { ThemeToggle } from '../components/ThemeToggle';

function YouTubeMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FF0000"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.4-1.9.5-3.8.5-5.8s-.1-3.9-.5-5.8z"
      />
      <path fill="#fff" d="M9.75 15.5v-7l6 3.5-6 3.5z" />
    </svg>
  );
}

export default function Home() {
  const nav = useNavigate();
  const { name, color, ready, setName } = useUserSession();
  const [recent, setRecent] = useState([]);
  const [joinInput, setJoinInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);

  useEffect(() => setNameDraft(name), [name]);

  useEffect(() => {
    setRecent(getRecentRooms());
    sweepIdleRooms();
  }, []);

  const createRoom = () => nav(`/room/${generateRoomId()}`);

  const joinById = (e) => {
    e.preventDefault();
    const id = joinInput.trim();
    if (!id) return;
    nav(`/room/${id}`);
  };

  const dropRecent = (id) => {
    removeRecentRoom(id);
    setRecent(getRecentRooms());
  };

  const saveName = () => {
    setName(nameDraft);
    setEditingName(false);
  };

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-16 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold tracking-tight text-brand-text">
            <span className="text-[#FF0000]">YT</span>Party
          </h1>
          <p className="text-xs text-brand-muted uppercase tracking-widest flex items-center justify-center gap-1.5">
            <YouTubeMark />
            Watch YouTube together, perfectly synced
          </p>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3 text-sm text-brand-text min-w-0">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  className="input w-full py-1"
                />
              ) : (
                <span className="truncate text-brand-muted">
                  Signed in as <span className="text-brand-text">{name}</span>
                </span>
              )}
            </div>
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-brand-muted hover:text-brand-text flex-shrink-0"
              >
                edit
              </button>
            )}
          </div>
          <button
            onClick={createRoom}
            disabled={!ready}
            className="w-full py-2.5 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition"
          >
            {ready ? 'Create a room' : 'Signing in…'}
          </button>
        </div>

        <form onSubmit={joinById} className="card p-5 space-y-3">
          <label className="text-xs text-brand-muted uppercase tracking-wider">Join by room ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="party-xxxxxx"
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={!ready || !joinInput.trim()}
              className="btn-ghost disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </form>

        {recent.length > 0 && (
          <div className="card p-5 space-y-3">
            <div className="text-xs text-brand-muted uppercase tracking-wider">Recent rooms</div>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-brand-hover transition"
                >
                  <button
                    onClick={() => nav(`/room/${r.id}`)}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="text-sm text-brand-text truncate font-medium">{r.id}</div>
                    <div className="text-xs text-brand-muted">{timeAgo(r.lastJoined)}</div>
                  </button>
                  <button
                    onClick={() => dropRecent(r.id)}
                    className="text-brand-muted hover:text-brand-text px-2 text-lg leading-none"
                    title="Remove from list"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-brand-muted">
          invite-only · synced · zero setup
        </p>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
