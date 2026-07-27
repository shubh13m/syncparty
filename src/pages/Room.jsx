import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useUserSession } from '../hooks/useUserSession';
import { useRoom } from '../hooks/useRoom';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { parseYouTubeId } from '../utils/youtubeUrl';

const STATE_LABELS = {
  '-1': 'unstarted',
  '0': 'ended',
  '1': 'playing',
  '2': 'paused',
  '3': 'buffering',
  '5': 'cued',
};
function stateLabel(s) {
  if (s === undefined || s === null) return '—';
  return STATE_LABELS[String(s)] || `?${s}`;
}

export default function Room() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const { name, color, setName } = useUserSession();
  const roomState = useRoom(roomId, { name, color });
  const { ready, kicked, error, leave } = roomState;

  const handleLeave = async () => {
    await leave();
    nav('/');
  };

  if (!ready) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate-400">
        Joining {roomId}…
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-brand-panel rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-semibold">You were removed</h2>
          <p className="text-slate-400">The host removed you from this room.</p>
          <Link to="/" className="inline-block px-5 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent/90 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-brand-panel rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-semibold text-red-400">Could not join room</h2>
          <p className="text-slate-400 text-sm">{String(error?.message || error)}</p>
          <Link to="/" className="inline-block px-5 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent/90 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RoomContent
      roomId={roomId}
      roomState={roomState}
      onLeave={handleLeave}
      setName={setName}
    />
  );
}

/**
 * RoomContent mounts only when the room is ready, guaranteeing the player's
 * container ref is present in the DOM before useYouTubePlayer's effect runs.
 */
function RoomContent({ roomId, roomState, onLeave, setName }) {
  const { uid, hostId, isHost, users } = roomState;
  const playerContainerRef = useRef(null);
  const player = useYouTubePlayer({
    roomId,
    isHost,
    containerRef: playerContainerRef,
  });

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(users?.[uid]?.name || '');
  const [urlInput, setUrlInput] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const inviteUrl = `${window.location.origin}/room/${roomId}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const saveName = () => {
    setName(nameDraft);
    setEditingName(false);
  };

  const loadFromUrl = (e) => {
    e.preventDefault();
    setLoadErr('');
    const id = parseYouTubeId(urlInput);
    if (!id) {
      setLoadErr('Not a valid YouTube URL or ID');
      return;
    }
    player.hostControls.loadVideo(id);
    setUrlInput('');
  };

  const userList = Object.entries(users);
  const viewerCount = userList.length;

  return (
    <div className="min-h-full p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onLeave} className="text-slate-400 hover:text-slate-200 text-sm">
            ← Leave
          </button>
          <div className="text-sm text-slate-400 truncate">
            Room: <code className="text-brand-accent2">{roomId}</code>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">🟢 {viewerCount} watching</span>
          <button
            onClick={copyInvite}
            className="px-3 py-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-sm font-medium"
          >
            {copied ? '✓ Copied!' : 'Copy invite link'}
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-3">
          <div className="bg-brand-panel rounded-2xl overflow-hidden aspect-video relative">
            <div ref={playerContainerRef} className="w-full h-full" />
            {!player.playback?.videoId && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm bg-brand-panel pointer-events-none">
                {isHost ? 'Paste a YouTube link below to start' : 'Waiting for host to play something…'}
              </div>
            )}
            {player.muted && player.playback?.videoId && (
              <button
                onClick={player.unmute}
                className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-sm font-medium shadow-lg"
              >
                🔊 Click to unmute
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isHost && (
              <>
                <button
                  onClick={player.hostControls.play}
                  className="px-3 py-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-sm font-medium"
                >
                  ▶ Play
                </button>
                <button
                  onClick={player.hostControls.pause}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                >
                  ⏸ Pause
                </button>
              </>
            )}
            <button
              onClick={player.resync}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
              title="Force local playback to catch up with host"
            >
              🔄 Resync
            </button>
            {!isHost && (
              <span className="text-xs text-slate-500">Only the host controls playback.</span>
            )}
            <span className="text-xs text-slate-500 ml-auto">
              sync: {stateLabel(player.playback?.state)} · local: {stateLabel(player.localState)}
            </span>
            {player.videoError && (
              <span className="text-xs text-red-400 basis-full">⚠ {player.videoError}</span>
            )}
          </div>

          {isHost && (
            <form onSubmit={loadFromUrl} className="bg-brand-panel rounded-2xl p-4 space-y-2">
              <label className="text-sm text-slate-300 font-medium">
                Load a YouTube video (host only)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or video ID"
                  className="flex-1 bg-brand-bg border border-slate-700 focus:border-brand-accent outline-none rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-sm font-medium"
                >
                  Play
                </button>
              </div>
              {loadErr && <div className="text-xs text-red-400">{loadErr}</div>}
              <p className="text-xs text-slate-500">Queue &amp; search coming in Phase 3.</p>
            </form>
          )}
        </div>

        <aside className="bg-brand-panel rounded-2xl p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-200">Viewers</div>
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="bg-brand-bg border border-slate-700 rounded px-2 py-0.5 text-xs w-24"
              />
            ) : (
              <button
                onClick={() => {
                  setNameDraft(users?.[uid]?.name || '');
                  setEditingName(true);
                }}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                edit name
              </button>
            )}
          </div>
          <ul className="space-y-1.5">
            {userList.map(([id, u]) => (
              <li key={id} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: u.color || '#888' }}
                />
                <span className="truncate">
                  {u.name}
                  {id === uid && <span className="text-slate-500"> (you)</span>}
                </span>
                {id === hostId && (
                  <span className="text-xs text-brand-accent2 ml-auto">host</span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
