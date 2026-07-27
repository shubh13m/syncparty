# SyncParty — v1 Implementation Plan

**Project:** Real-time, multi-room YouTube synchronized watch party web app
**Stack:** Vite + React + Tailwind CSS + Firebase (Realtime DB + Anonymous Auth) + YouTube IFrame API
**Infrastructure budget:** **$0.00 / month** (verified, see §8)
**Document version:** 1.0
**Date:** 2026-07-27

---

## 1. Executive Summary

SyncParty lets a host create an invite-only room, share a link, and watch YouTube videos in sync with friends. The host has full playback control; joiners can search YouTube, add to a shared queue, and chat. All media streams directly from YouTube's CDN — the app itself only moves small JSON metadata over Firebase Realtime Database, keeping infrastructure cost at $0.

---

## 2. Locked Design Decisions

| Decision | Choice |
|---|---|
| Room discovery | **Invite-only** — no global public lobby |
| Control mode | **Host DJ only** — host controls playback; joiners auto-sync |
| Joining | Auto-join on visiting `?room=xxx` URL; creates room if missing |
| Identity | Firebase **Anonymous Auth** for stable UIDs; display name in localStorage |
| Host-left | Auto-promote longest-connected joiner; if room empty → delete |
| Idle cleanup | On any join, delete rooms with `lastActivity > 24h` old |
| Recent rooms | Stored in **localStorage** only (per-browser), not globally listed |
| YouTube search | Data API v3 with graceful fallback to paste-URL when quota exhausted |
| Video metadata | oEmbed (no quota, no key) for thumbnails and titles |
| Sync algorithm | State-based elapsed time with `.info/serverTimeOffset` clock-skew correction |
| Drift threshold | 2 seconds before triggering `seekTo()` |
| Queue / messages | `push()`-keyed collections (never arrays) |
| Mobile | Responsive with bottom tab bar (Player / Queue / Chat) |
| Installability | PWA via `vite-plugin-pwa` |

---

## 3. Feature Set (v1)

### Core (from original spec)
- Invite-only rooms with auto-join
- Shared YouTube queue
- Live chat
- Real-time presence list
- Synchronized playback via YouTube IFrame API
- Floating mini-player (draggable)
- Resync / catch-up button

### Added in this v1
- **PWA install** (add-to-homescreen)
- **Mobile-responsive** layout with tab bar
- **Idle room auto-cleanup** (>24h inactive)
- **Host-left flow** (auto-promote or wipe)
- **Shuffle queue** (host only)
- **Recent rooms** on homepage (localStorage)
- Autoplay next in queue
- Thumbnails + titles via oEmbed
- Per-user local volume
- Deterministic avatar colors
- Viewer count in header
- Host keyboard shortcuts (Space, N, S, M)
- Firebase Anonymous Auth
- Server-enforced Security Rules

### Explicitly out of scope (v1)
- Open DJ mode
- Video/voice chat between users
- User accounts (email/password)
- Non-YouTube video sources
- Server-side moderation
- Recording sessions
- Public room lobby / discovery

---

## 4. System Architecture

```
+-----------------------------------------------------------------------------+
|                           CLIENT BROWSERS                                    |
|  +---------------------------+       +-----------------------------+        |
|  | Host Client (React PWA)   |       | Joiner Client (React PWA)   |        |
|  | - YouTube IFrame player   |       | - YouTube IFrame player     |        |
|  | - Publishes playback state|       | - Reads playback state      |        |
|  | - Manages queue + kicks   |       | - Drift-corrects via seekTo |        |
|  +------------+--------------+       +------------+----------------+        |
+---------------|-------------------------------------|-----------------------+
                | JSON writes                          | JSON reads (websocket)
                v                                      v
+-----------------------------------------------------------------------------+
|              FIREBASE REALTIME DATABASE (Spark / free tier)                  |
|  /rooms/{roomId}/meta       { hostId, createdAt, lastActivity }             |
|  /rooms/{roomId}/playback   { videoId, state, currentTime, updatedAt }      |
|  /rooms/{roomId}/queue/{k}  { videoId, title, thumb, addedByUid, addedAt }  |
|  /rooms/{roomId}/messages/{k} { senderUid, name, text, timestamp }          |
|  /rooms/{roomId}/users/{uid}  { name, color, joinedAt }                     |
|  /rooms/{roomId}/kicked/{uid} true                                          |
|  Enforced by Security Rules — host-only writes on /playback, /meta, etc.    |
+-----------------------------------------------------------------------------+
                                    | Video / audio
                                    v
+-----------------------------------------------------------------------------+
|                          YOUTUBE INFRASTRUCTURE                              |
|      Delivers 100% of video/audio bytes directly to client embeds.           |
|      Zero bandwidth cost to SyncParty.                                       |
+-----------------------------------------------------------------------------+
```

---

## 5. Data Schema (Firebase RTDB)

```json
{
  "rooms": {
    "party-8f2a9c": {
      "meta": {
        "hostId": "uid_abc123",
        "createdAt": 1772000000000,
        "lastActivity": 1772000123456
      },
      "playback": {
        "videoId": "dQw4w9WgXcQ",
        "state": 1,
        "currentTime": 42.5,
        "updatedAt": 1772000005120
      },
      "queue": {
        "-Nabc123": {
          "videoId": "L_LUpnjgPso",
          "title": "Lofi Beat",
          "thumb": "https://i.ytimg.com/vi/L_LUpnjgPso/mqdefault.jpg",
          "addedByUid": "uid_def456",
          "addedByName": "Guest_4821",
          "addedAt": 1772000010000
        }
      },
      "messages": {
        "-Nmsg789": {
          "senderUid": "uid_def456",
          "name": "Guest_4821",
          "text": "Great song!",
          "timestamp": 1772000006000
        }
      },
      "users": {
        "uid_abc123": {
          "name": "Host_Master",
          "color": "#a3e635",
          "joinedAt": 1772000000000
        }
      },
      "kicked": {
        "uid_bad999": true
      }
    }
  }
}
```

**Notes**
- `state` values follow YouTube IFrame API: `-1` unstarted, `0` ended, `1` playing, `2` paused, `3` buffering, `5` cued.
- `updatedAt`, `createdAt`, `lastActivity`, `joinedAt`, `addedAt`, `timestamp` are written with `firebase.database.ServerValue.TIMESTAMP` (server-stamped, not client clock).
- All keys under `queue` and `messages` are `push()`-generated (chronological, collision-free).

---

## 6. Sync Algorithm

### 6.1 Formula
```
correctedNow    = Date.now() + serverTimeOffset
expectedTime    = playback.currentTime + (correctedNow - playback.updatedAt) / 1000
drift           = |localPlayer.getCurrentTime() - expectedTime|
```
Where `serverTimeOffset` comes from Firebase RTDB's `.info/serverTimeOffset` reference (auto-computed by the SDK).

### 6.2 Rules
1. **Only the host writes to `/playback`** — enforced by Security Rules.
2. Host publishes a snapshot on every state change (play, pause, seek, next video), never on a timer.
3. Joiners re-evaluate `expectedTime` when `/playback` changes OR when local player transitions between states.
4. `seekTo()` is called **only if** `drift > 2.0s` AND local state is not `3` (buffering) or `-1` (unstarted).
5. On video end (`state === 0`), the host advances to the next queue item.
6. On `onError`, current item is auto-skipped with a toast.

### 6.3 Ad handling (best-effort)
YouTube provides no ad-detection API. Mitigation:
- During local `state === 3` (buffering) sync is paused.
- On transition back to `state === 1`, drift is re-evaluated and `seekTo()` fires once if needed.
- **Users will drift by ad duration during unskippable ads** — this is a platform limitation, not a bug. A "one of your friends is watching an ad" indicator will surface the state.

---

## 7. Folder Structure

```
youwatch/
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── manifest.webmanifest         # (generated by vite-plugin-pwa)
├── src/
│   ├── components/
│   │   ├── MiniPlayer.jsx           # Draggable floating player + host controls
│   │   ├── QueueList.jsx            # Queue with thumbnails + remove/shuffle
│   │   ├── AddToQueue.jsx           # Search tab + paste-URL tab
│   │   ├── ChatBox.jsx              # Live chat with color-coded users
│   │   ├── UserList.jsx             # Presence list + kick buttons (host)
│   │   ├── RoomHeader.jsx           # Room ID, copy invite, viewer count
│   │   └── BottomTabs.jsx           # Mobile-only tab switcher
│   ├── hooks/
│   │   ├── useUserSession.js        # UID + display name + color
│   │   ├── useRoom.js               # Auto-join, presence, host-left, kicked
│   │   └── useYouTubePlayer.js      # IFrame API + drift correction
│   ├── services/
│   │   ├── firebase.js              # Init app, db, auth, server offset
│   │   └── youtubeApi.js            # Data API search + oEmbed metadata
│   ├── utils/
│   │   ├── syncMath.js              # expectedTime, shouldSeek
│   │   ├── random.js                # generateRoomId, generateGuestName
│   │   ├── colors.js                # deterministic user color from uid
│   │   ├── roomCleanup.js           # idle room deletion
│   │   └── youtubeUrl.js            # parse youtube URL / ID
│   ├── pages/
│   │   ├── Home.jsx                 # Landing + recent rooms + create/join
│   │   └── Room.jsx                 # Main watch party UI
│   ├── App.jsx                      # Router
│   ├── main.jsx                     # Entry, Tailwind CSS import
│   └── index.css                    # Tailwind directives
├── firebase.rules.json              # Security rules (deploy manually)
├── .env.example
├── .gitignore
├── vite.config.js                   # Includes PWA plugin
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── README.md
└── PLAN.md                          # this file
```

---

## 8. $0 Cost Verification

| Component | Provider | Free tier allowance | Our expected usage | Fits? |
|---|---|---|---|---|
| Static hosting | **Cloudflare Pages** (or Vercel Hobby) | Unlimited bandwidth, unlimited requests, 500 builds/month, free SSL, global CDN | ~400 KB SPA bundle, small user base | ✅ |
| Realtime DB | **Firebase Spark** | 100 concurrent connections, 1 GB stored, 10 GB/month egress | ~10 rooms × 10 users = 100 max; JSON payloads <1 KB per event | ✅ within limit |
| Auth | **Firebase Anonymous Auth** | Unlimited on Spark | 1 anon signin per browser | ✅ |
| Media delivery | **YouTube IFrame API** | Unlimited video bandwidth (YouTube pays) | 100% of video bytes | ✅ |
| Video metadata | **YouTube oEmbed** | No key, no quota, no rate limit documented | 1 call per queue add | ✅ |
| Video search | **YouTube Data API v3** | 10,000 quota units/day free (search = 100 units) | ~100 searches/day project-wide | ⚠️ soft cap — see §8.1 |
| Code hosting + CI | **GitHub** (public or private) | Unlimited private repos, 2,000 Actions min/month | Manual deploys OR simple GH Action | ✅ |
| DNS | **Cloudflare** (if custom domain) | Free plan | Optional; app works fine on `*.pages.dev` | ✅ |

**Total recurring cost: $0.00 / month.**

### 8.1 Managing the YouTube Data API quota
100 searches/day project-wide is the tightest constraint. Mitigations built into v1:
1. **Debounced search** — no request until user pauses typing for 400 ms.
2. **Paste-URL tab** — never uses quota; always available as the primary "add" path.
3. **Client-side quota display** — when a 403 quota-exceeded response arrives, search is disabled for the rest of the day with a clear message: *"Search is temporarily unavailable. Please paste a YouTube link instead."*
4. **oEmbed for metadata** — separate endpoint with no quota, so thumbnails/titles always work.
5. **Future upgrade path (still free)**: users can bring their own API key stored in localStorage → unlimited per user, still $0. Kept as v1.1 if quota becomes a real bottleneck.

### 8.2 Hard $0 guarantees
- **Firebase billing plan stays on Spark** — we will NOT upgrade to Blaze. If usage exceeds Spark limits, the DB simply refuses new connections; no charges can accrue.
- **Cloudflare Pages / Vercel Hobby** — both have no auto-upgrade to paid; excess usage results in throttling, not billing.
- **No Cloud Functions, no Cloud Storage, no third-party paid APIs** — nothing that can trigger a bill.

---

## 9. Security Rules Outline

Deployed as `firebase.rules.json` via the Firebase console. Key invariants:

- **Read** `/rooms/{roomId}`: any authenticated user NOT in `/kicked`.
- **Write** `/rooms/{roomId}/playback`: only if `auth.uid === meta.hostId`.
- **Write** `/rooms/{roomId}/meta` (except `lastActivity` and `hostId`): only host.
- **Write** `/rooms/{roomId}/meta/hostId`: allowed only if previous host UID no longer exists in `/users` (transaction-safe promotion).
- **Write** `/rooms/{roomId}/meta/lastActivity`: any authenticated user in the room.
- **Create** `/queue/{key}`: any auth user; must include own UID as `addedByUid`.
- **Delete** `/queue/{key}`: host OR the original `addedByUid`.
- **Update** `/queue/{key}` (reorder): host only.
- **Create** `/messages/{key}`: any auth user; must include own UID.
- **Delete** `/messages/{key}`: host only.
- **Create/update** `/users/{uid}`: only if `uid === auth.uid` AND not in `/kicked`.
- **Delete** `/users/{uid}`: self or host (kick).
- **Write** `/kicked/{uid}`: host only.
- **Delete** entire `/rooms/{roomId}`: host OR any authenticated user if `now - meta.lastActivity > 24h`.

---

## 10. Step-by-Step Build Order

### Phase 0 — Scaffolding
1. Initialize Vite React project, install deps (`firebase`, `react-router-dom`, `tailwindcss`, `postcss`, `autoprefixer`, `vite-plugin-pwa`, `nanoid`).
2. Configure Tailwind + PostCSS + Vite PWA plugin.
3. Create folder structure, `.env.example`, `.gitignore`, base `App.jsx` and `main.jsx`.
4. Firebase service module + anonymous sign-in bootstrap.
5. `useUserSession` hook (uid, name, color, localStorage persistence).

### Phase 1 — Room Routing & Auto-Join
6. React Router routes (`/` Home, `/room/:id` or `/?room=` Room).
7. `useRoom` hook: parse ID, create-or-join, presence write, `onDisconnect`, kicked listener.
8. Home page: Create Room button, Recent Rooms list (localStorage), Join-by-ID input.
9. `roomCleanup` utility: on any join, sweep and delete idle rooms >24h.

### Phase 2 — Sync Engine
10. YouTube IFrame API loader in `youtubeApi.js`.
11. `useYouTubePlayer` hook with drift correction and clock-skew via `.info/serverTimeOffset`.
12. `syncMath` utility (pure functions, unit-testable).
13. Autoplay-next handler in host client on `state === 0`.

### Phase 3 — Queue, Search, Chat, Presence
14. `AddToQueue` component with Search tab (Data API, debounced) + Paste-URL tab.
15. oEmbed metadata fetch on add.
16. `QueueList` component with thumbnails, remove buttons, shuffle (host).
17. `ChatBox` with `push()`, colored senders, auto-scroll, 200-message prune.
18. `UserList` presence sidebar with host badge and kick buttons.

### Phase 4 — Host Controls & Security
19. Player controls: play/pause/seek/next disabled for non-hosts.
20. Host-left promotion via `runTransaction` on `/meta/hostId`.
21. Kick flow (write `/kicked/{uid}` + remove `/users/{uid}`).
22. Author and test `firebase.rules.json`.

### Phase 5 — UI Polish
23. Responsive layout (desktop 3-column, mobile bottom tabs).
24. Mini-player component (draggable, unread chat badge).
25. Keyboard shortcuts for host (Space, N, S, M).
26. Toasts for kicks, host promotion, ad-drift, quota-exhausted, errors.

### Phase 6 — PWA & Deploy
27. PWA manifest + icons + service worker via `vite-plugin-pwa`.
28. Deploy static build to Cloudflare Pages (or Vercel Hobby).
29. Deploy security rules via Firebase console.
30. End-to-end smoke test with two browsers on two networks.

---

## 11. Inputs Needed From User

Not required to start building — placeholders will be used until provided.

| Input | Where used | When needed |
|---|---|---|
| Firebase project config (6 env vars) | `.env` → `services/firebase.js` | Before first real test |
| YouTube Data API v3 key | `.env` → `services/youtubeApi.js` | Before Phase 3 (search) |
| Deploy target choice | Deploy step only | Phase 6 |

Setup guides for both Firebase and Google Cloud API key will be included in the final `README.md`.

---

## 12. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| YouTube Data API quota exhausts in a day | High | Paste-URL fallback always available; disable search UI on 403 |
| Some videos not embeddable (labels, age-gate) | High | `onError` handler auto-skips with toast |
| Firebase 100-connection cap hit | Low at hobby scale | UI shows "room full" message; upgrading requires Blaze plan (won't do in v1) |
| Sync drifts during YouTube ads | High (platform limit) | Best-effort resync on state transition; ad-drift indicator in UI |
| Mobile background audio blocked (iOS) | Certain | Documented limitation; on-screen "keep tab active" note |
| Host clock badly skewed | Low | `serverTimeOffset` correction; server-stamped `updatedAt` |
| Kicked user re-joins immediately | Low | Security rule blocks `/users/{uid}` writes while in `/kicked` |
| Race on host promotion | Low | `runTransaction` on `/meta/hostId` guarantees single winner |
| Abandoned rooms accumulate | Medium | 24h idle-cleanup runs on every join |

---

## 13. Success Criteria for v1

- Two browsers on two networks stay within 2 seconds of each other during normal playback.
- Host can control playback; joiners cannot (verified both in UI and by direct DB write attempts).
- Kicked users are removed and cannot re-join.
- Host disconnecting promotes a new host within 5 seconds, or deletes the empty room.
- App is installable as a PWA on desktop and mobile.
- Layout is usable on a 360px-wide phone screen.
- Firebase billing dashboard shows $0.00 after a week of testing.

---

**Status: PLAN APPROVED — awaiting user "go" to begin Phase 0, Step 1.**
