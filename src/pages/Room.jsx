import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useUserSession } from '../hooks/useUserSession';
import { useRoom } from '../hooks/useRoom';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { useRoomQueue } from '../hooks/useRoomQueue';
import { useChat } from '../hooks/useChat';
import { QueuePanel } from '../components/QueuePanel';
import { ChatPanel } from '../components/ChatPanel';
import { SearchPanel } from '../components/SearchPanel';

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
      name={name}
      color={color}
    />
  );
}

function RoomContent({ roomId, roomState, onLeave, setName, name, color }) {
  const { uid, hostId, isHost, users } = roomState;
  const playerContainerRef = useRef(null);

  const queue = useRoomQueue(roomId, { uid, name, isHost });
  const chat = useChat(roomId, { uid, name, color });

  const queueItemsRef = useRef(queue.items);
  queueItemsRef.current = queue.items;
  const currentVideoIdRef = useRef(null);
  const playerRefHolder = useRef(null);

  const handleEnded = useCallback(() => {
    if (!isHost) return;
    const items = queueItemsRef.current;
    const curId = currentVideoIdRef.current;
    if (!items.length) return;
    const idx = curId ? items.findIndex((it) => it.videoId === curId) : -1;
    const next = idx >= 0 ? items[idx + 1] : items[0];
    if (!next) return;
    playerRefHolder.current?.hostControls.loadVideo(next.videoId);
    if (idx >= 0) queue.removeItem(items[idx].key);
  }, [isHost, queue]);

  const player = useYouTubePlayer({
    roomId,
    isHost,
    containerRef: playerContainerRef,
    onEnded: handleEnded,
  });

  playerRefHolder.current = player;
  currentVideoIdRef.current = player.playback?.videoId || null;

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(users?.[uid]?.name || '');
  const [tab, setTab] = useState('queue');

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

  const addToQueue = (meta) => queue.add(meta);
  const playNow = (meta) => {
    if (!isHost) return;
    player.hostControls.loadVideo(meta.videoId);
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

      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3">
          <div className="bg-brand-panel rounded-2xl overflow-hidden aspect-video relative">
            <div ref={playerContainerRef} className="w-full h-full" />
            {!player.playback?.videoId && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm bg-brand-panel pointer-events-none">
                {isHost ? 'Search or paste a link in the Queue tab →' : 'Waiting for host to play something…'}
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
        </div>

        <aside className="bg-brand-panel rounded-2xl p-3 space-y-3 h-fit">
          <div className="flex bg-brand-bg/60 rounded-lg p-0.5 text-xs">
            {[
              { k: 'queue', label: `Queue${queue.items.length ? ` (${queue.items.length})` : ''}` },
              { k: 'chat', label: `Chat${chat.messages.length ? ` (${chat.messages.length})` : ''}` },
              { k: 'viewers', label: `Viewers (${viewerCount})` },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`flex-1 px-2 py-1.5 rounded-md transition ${tab === t.k ? 'bg-brand-accent text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'queue' && (
            <div className="space-y-3">
              <SearchPanel onAdd={addToQueue} onPlayNow={playNow} isHost={isHost} />
              <div className="border-t border-slate-700/50 pt-3">
                <QueuePanel
                  items={queue.items}
                  currentVideoId={player.playback?.videoId}
                  isHost={isHost}
                  uid={uid}
                  onPlayNow={(it) => playNow(it)}
                  onRemove={queue.removeItem}
                  onShuffle={queue.shuffle}
                  onClear={queue.clear}
                />
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <ChatPanel messages={chat.messages} uid={uid} onSend={chat.send} />
          )}

          {tab === 'viewers' && (
            <div className="space-y-3">
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
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
