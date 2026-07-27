import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useUserSession } from '../hooks/useUserSession';
import { useRoom } from '../hooks/useRoom';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { useRoomQueue } from '../hooks/useRoomQueue';
import { useChat } from '../hooks/useChat';
import { QueuePanel } from '../components/QueuePanel';
import { ChatPanel } from '../components/ChatPanel';
import { SearchPanel } from '../components/SearchPanel';
import { useToast } from '../components/Toast';
import { ThemeToggle } from '../components/ThemeToggle';

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
  const { ready, kicked, ended, error, leave } = roomState;

  const handleLeave = async () => {
    await leave();
    nav('/');
  };

  if (!ready) {
    return (
      <div className="min-h-full flex items-center justify-center text-brand-muted">
        Joining {roomId}…
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-brand-panel rounded-xl p-8 space-y-4">
          <h2 className="text-2xl font-semibold">You were removed</h2>
          <p className="text-brand-muted">The host removed you from this room.</p>
          <Link to="/" className="inline-block px-5 py-2 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-brand-panel rounded-xl p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Room ended</h2>
          <p className="text-brand-muted">The host ended this room.</p>
          <Link to="/" className="inline-block px-5 py-2 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-brand-panel rounded-xl p-8 space-y-4">
          <h2 className="text-2xl font-semibold text-red-400">Could not join room</h2>
          <p className="text-brand-muted text-sm">{String(error?.message || error)}</p>
          <Link to="/" className="inline-block px-5 py-2 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 font-medium">
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
  const { uid, hostId, isHost, users, kickUser, endRoom } = roomState;
  const nav = useNavigate();
  const toast = useToast();
  const playerContainerRef = useRef(null);

  // Track host promotion: fire toast when *we* become host after previously not being host.
  const prevIsHostRef = useRef(null);
  useEffect(() => {
    // Skip the very first observed value (that's the initial state, not a promotion).
    if (prevIsHostRef.current === null) {
      prevIsHostRef.current = isHost;
      return;
    }
    if (isHost && !prevIsHostRef.current) {
      toast.success('You are now the host');
    }
    prevIsHostRef.current = isHost;
  }, [isHost, toast]);

  // Fire a toast when a video error occurs.
  const prevVideoErrorRef = useRef(null);

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

  // Video error toast (fires once per new error).
  useEffect(() => {
    if (player.videoError && player.videoError !== prevVideoErrorRef.current) {
      toast.error(player.videoError);
    }
    prevVideoErrorRef.current = player.videoError;
  }, [player.videoError, toast]);

  playerRefHolder.current = player;
  currentVideoIdRef.current = player.playback?.videoId || null;

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(users?.[uid]?.name || '');
  const [tab, setTab] = useState('queue');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmKick, setConfirmKick] = useState(null); // uid pending kick confirm

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

  const doKick = async (targetId, targetName) => {
    await kickUser(targetId);
    toast.info(`Removed ${targetName || 'user'}`);
  };

  const userList = Object.entries(users);
  const viewerCount = userList.length;

  return (
    <div className="min-h-full p-2 sm:p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onLeave} className="text-brand-muted hover:text-brand-text text-sm transition">
            ← Leave
          </button>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-text tracking-tight">
            <svg width="18" height="18" viewBox="0 0 96 96" aria-hidden="true">
              <path d="M22 20 L58 48 L22 76 Z" className="fill-brand-text" />
              <path d="M42 20 L78 48 L42 76 Z" fill="#FF0000" />
            </svg>
            <span><span className="text-[#FF0000]">YT</span>Party</span>
          </div>
          <div className="text-sm text-brand-muted truncate hidden sm:block">
            <code className="text-brand-text font-medium">{roomId}</code>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-brand-muted">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {viewerCount} watching
          </span>
          <ThemeToggle />
          <button
            onClick={copyInvite}
            className="px-3 py-1.5 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 text-sm font-medium"
          >
            {copied ? '✓ Copied!' : (
              <>
                <span className="hidden sm:inline">Copy invite link</span>
                <span className="sm:hidden">Invite</span>
              </>
            )}
          </button>
          {isHost && (
            <button
              onClick={() => {
                if (confirmEnd) {
                  endRoom().then(() => nav('/'));
                } else {
                  setConfirmEnd(true);
                  setTimeout(() => setConfirmEnd(false), 3000);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${confirmEnd ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-panel border border-brand-border hover:border-red-500/60 hover:text-red-400'}`}
              title="End room for everyone"
            >
              {confirmEnd ? 'Confirm?' : (
                <>
                  <span className="hidden sm:inline">End room</span>
                  <span className="sm:hidden">End</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-[1fr_320px] gap-3 md:gap-4">
        <div className="space-y-3">
          <div className="bg-brand-panel border border-brand-border rounded-xl overflow-hidden aspect-video relative">
            <div ref={playerContainerRef} className="w-full h-full" />
            {!player.playback?.videoId && (
              <div className="absolute inset-0 flex items-center justify-center text-brand-muted text-sm bg-brand-panel pointer-events-none">
                {isHost ? 'Search or paste a link in the Queue tab →' : 'Waiting for host to play something…'}
              </div>
            )}
            {player.muted && player.playback?.videoId && (
              <button
                onClick={player.unmute}
                className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 text-sm font-medium shadow-lg"
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
                  className="px-3 py-1.5 rounded-lg bg-brand-accent text-brand-accent-fg hover:opacity-90 text-sm font-medium"
                >
                  ▶ Play
                </button>
                <button
                  onClick={player.hostControls.pause}
                  className="px-3 py-1.5 rounded-lg bg-brand-panel border border-brand-border hover:bg-brand-hover text-sm"
                >
                  ⏸ Pause
                </button>
              </>
            )}
            <button
              onClick={player.resync}
              className="px-3 py-1.5 rounded-lg bg-brand-panel border border-brand-border hover:bg-brand-hover text-sm"
              title="Force local playback to catch up with host"
            >
              🔄 Resync
            </button>
            {!isHost && (
              <span className="text-xs text-brand-muted">Only the host controls playback.</span>
            )}
            <span className="text-xs text-brand-muted ml-auto">
              sync: {stateLabel(player.playback?.state)} · local: {stateLabel(player.localState)}
            </span>
            {player.videoError && (
              <span className="text-xs text-red-400 basis-full">⚠ {player.videoError}</span>
            )}
          </div>
        </div>

        <aside className="bg-brand-panel border border-brand-border rounded-xl p-3 space-y-3 h-fit">
          <div className="flex border-b border-brand-border text-xs">
            {[
              { k: 'queue', label: `Queue${queue.items.length ? ` (${queue.items.length})` : ''}` },
              { k: 'chat', label: `Chat${chat.messages.length ? ` (${chat.messages.length})` : ''}` },
              { k: 'viewers', label: `Viewers (${viewerCount})` },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`flex-1 px-2 py-2 -mb-px transition border-b-2 ${tab === t.k ? 'border-brand-text text-brand-text' : 'border-transparent text-brand-muted hover:text-brand-text'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'queue' && (
            <div className="space-y-3">
              <SearchPanel onAdd={addToQueue} onPlayNow={playNow} isHost={isHost} />
              <div className="border-t border-brand-border pt-3">
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
                <div className="text-sm font-semibold text-brand-text">Viewers</div>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    className="bg-brand-bg border border-brand-border rounded px-2 py-0.5 text-xs w-24"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setNameDraft(users?.[uid]?.name || '');
                      setEditingName(true);
                    }}
                    className="text-xs text-brand-muted hover:text-brand-text"
                  >
                    edit name
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">
                {userList.map(([id, u]) => {
                  const isMe = id === uid;
                  const isHostRow = id === hostId;
                  const canKick = isHost && !isMe;
                  const pendingKick = confirmKick === id;
                  return (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: u.color || '#888' }}
                      />
                      <span className="truncate">
                        {u.name}
                        {isMe && <span className="text-brand-muted"> (you)</span>}
                      </span>
                      {isHostRow && (
                        <span className="text-xs text-brand-accent2 ml-auto">host</span>
                      )}
                      {canKick && (
                        <button
                          onClick={() => {
                            if (pendingKick) {
                              doKick(id, u.name);
                              setConfirmKick(null);
                            } else {
                              setConfirmKick(id);
                              setTimeout(() => setConfirmKick((cur) => (cur === id ? null : cur)), 3000);
                            }
                          }}
                          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${pendingKick ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-panel border border-brand-border hover:border-red-500/60 hover:text-red-400'}`}
                          title="Kick user"
                        >
                          {pendingKick ? 'Confirm?' : 'Kick'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
