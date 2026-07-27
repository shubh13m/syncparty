import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserSession } from '../hooks/useUserSession';
import { generateRoomId } from '../utils/random';
import { getRecentRooms, removeRecentRoom } from '../utils/recentRooms';
import { sweepIdleRooms } from '../utils/roomCleanup';

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
    <div className="min-h-full flex flex-col items-center px-4 py-10">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-brand-accent to-brand-accent2 bg-clip-text text-transparent">
            SyncParty
          </h1>
          <p className="mt-3 text-slate-400">
            Watch YouTube together, perfectly synced. Zero setup.
          </p>
        </div>

        <div className="bg-brand-panel rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3 text-sm text-slate-300 min-w-0">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  className="bg-brand-bg border border-slate-700 rounded px-2 py-1 text-sm w-full"
                />
              ) : (
                <span className="truncate">
                  Signed in as <b>{name}</b>
                </span>
              )}
            </div>
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-slate-400 hover:text-slate-200 flex-shrink-0"
              >
                edit
              </button>
            )}
          </div>
          <button
            onClick={createRoom}
            disabled={!ready}
            className="w-full py-3 rounded-xl bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition"
          >
            {ready ? 'Create a Room' : 'Signing in…'}
          </button>
        </div>

        <form onSubmit={joinById} className="bg-brand-panel rounded-2xl p-6 space-y-3">
          <label className="text-sm text-slate-300 font-medium">Join by room ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="party-xxxxxx"
              className="flex-1 bg-brand-bg border border-slate-700 focus:border-brand-accent outline-none rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!ready || !joinInput.trim()}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-sm font-medium transition"
            >
              Join
            </button>
          </div>
        </form>

        {recent.length > 0 && (
          <div className="bg-brand-panel rounded-2xl p-6 space-y-3">
            <div className="text-sm text-slate-300 font-medium">Recent rooms</div>
            <ul className="space-y-2">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 bg-brand-bg rounded-lg px-3 py-2"
                >
                  <button
                    onClick={() => nav(`/room/${r.id}`)}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="text-sm text-brand-accent2 truncate">{r.id}</div>
                    <div className="text-xs text-slate-500">{timeAgo(r.lastJoined)}</div>
                  </button>
                  <button
                    onClick={() => dropRecent(r.id)}
                    className="text-xs text-slate-500 hover:text-slate-300 px-2"
                    title="Remove from list"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-xs text-slate-600">
          v1 · invite-only · $0 hosted
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
