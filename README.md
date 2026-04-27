# MeloStream

MeloStream is a full-stack music platform with a React client and an Express API.
It supports authenticated playback, search, likes, playlists, admin uploads, artist/album detail pages, and frontend error telemetry.

Last verified against source: April 27, 2026.

## Repository Layout

- `client/`: React 18 app (React Router + React Query + Zustand + Firebase Web SDK)
- `server/`: Express API (Firebase Admin + Firestore + Cloudinary)
- `shared/`: cross-layer constants (`shared/constants/errorCodes.js`)

## Key Runtime Architecture

- Frontend app shell is in `client/src/App.jsx` with:
	- `QueryClientProvider`
	- `BrowserRouter`
	- layered error boundaries (`AppErrorBoundary`, `PlayerErrorBoundary`)
	- global `MusicPlayer` mounted outside route switches (playback persists across route changes)
- Frontend auth uses Firebase Auth and sends `Authorization: Bearer <idToken>` in Axios.
- Backend validates Firebase ID tokens using:
	- `verifyToken` (non-strict, no revocation check)
	- `verifyTokenStrict` (strict, revocation-aware)
- Backend middleware order in `server/src/index.js`:
	1. `helmet`
	2. CORS
	3. body parsers
	4. correlation ID middleware
	5. global limiter
	6. `/health` and `/ready`
	7. `/api/*` routes
	8. 404 handler
	9. global error handler
- Data plane:
	- Firestore stores users, songs, artists, albums, playlists, session picks metadata
	- Cloudinary stores audio and cover assets

## Feature Snapshot

### User-facing

- Firebase auth (email/password and provider-based flows)
- Cursor-paginated song browsing
- Search with split debounce:
	- URL debounce in search bar: 300ms
	- API debounce in hook: 400ms
- Like/unlike songs and view liked songs
- Browse public admin playlists and user playlists
- Artist detail and album detail pages
- Keyboard controls + Media Session integration

### Admin-facing

- Admin route protection using Firebase custom claim (`admin: true`)
- Song upload/update/delete
- Bulk song deletion
- Playlist creation/deletion and upload-song flow
- User listing

### Reliability and observability

- Correlation IDs (`X-Correlation-ID`) included and exposed over CORS
- `/health`, `/ready`, and `/api/health` probes
- Frontend error batch ingestion at `POST /api/errors/report`
- In-memory server caching for high-read endpoints (TTL-based)
- Session picks queue with async draining and graceful shutdown hooks

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+
- Firebase project (Auth + Firestore)
- Cloudinary account

### Install

```bash
cd client
npm install

cd ../server
npm install
```

### Run

Terminal 1 (API):

```bash
cd server
npm run dev
```

Terminal 2 (Client):

```bash
cd client
npm start
```

Default local URLs:

- Client: `http://localhost:3000`
- API root: `http://localhost:5000`
- API base used by client: `http://localhost:5000/api`

## Environment Variables

Create:

- `client/.env`
- `server/.env`

Use `.env.example` files as the canonical source.

### Client (`client/.env`)

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

### Server (`server/.env`)

```env
PORT=5000
NODE_ENV=development

FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Comma-separated origins supported
CLIENT_ORIGIN=http://localhost:3000

# Bootstrap admin fallback
ADMIN_EMAILS=admin@example.com,another@example.com

# Optional runtime controls
BACKEND_URL=https://your-backend.example.com
KEEP_ALIVE_INTERVAL_MS=840000
FIRESTORE_INDEXES_VERIFIED=true
```

Notes:

- Keep `FIREBASE_PRIVATE_KEY` quoted and preserve escaped `\n`.
- `validateEnv` exits startup if required env vars are missing.

## Admin Claim Setup

1. Ensure target accounts already exist in Firebase Auth.
2. Set `ADMIN_EMAILS` in `server/.env`.
3. Run:

```bash
cd server
node scripts/setAdminClaim.js
```

4. Have those users sign out/sign in to refresh token claims.

Primary authorization source is Firebase custom claim: `req.user.admin === true`.

## Migration Scripts

Run from `server/`.

### Search field backfill

Adds/repairs `titleLower` and `artistLower` on songs.

```bash
# dry run
node scripts/migrateSearchFields.js --dry-run

# live run
node scripts/migrateSearchFields.js

# rollback
node scripts/migrateSearchFields.js --rollback=../logs/backup-searchfields-<timestamp>.json
```

### Artist/album backfill

Backfills `artistId`, `albumId`, and `trackNumber` on songs (idempotent).

```bash
# dry run
node scripts/migrateArtistAlbum.js --dry-run

# live run
node scripts/migrateArtistAlbum.js

# rollback
node scripts/migrateArtistAlbum.js --rollback=../logs/backup-artistalbum-<timestamp>.json
```

## API Contract Snapshot

Base URL: `http://localhost:5000`

### Health and readiness

- `GET /health` -> liveness payload
- `GET /ready` -> dependency readiness (`200` or `503`)
- `GET /api/health` -> API-scoped health payload

### Auth

- `POST /api/auth/verify` -> `{ uid, ...userPayload }`

### Songs

- `GET /api/songs?limit=<n>&cursor=<docId>` -> `{ songs, nextCursor, hasMore }`
- `GET /api/songs/:id` -> `Song` or `404 { error, code: "NOT_FOUND" }`
- `POST /api/songs/batch` -> `{ success: true, data: Song[] }`
- `POST /api/songs/check-duplicate` -> `{ duplicate: boolean, existing?: SongLike }`
- `POST /api/songs` (admin) -> `Song` (created)
- `PATCH /api/songs/:id` (admin) -> `Song` (updated)
- `DELETE /api/songs/:id` (admin) -> `{ message: "Song deleted successfully" }`
- `DELETE /api/songs/bulk-delete` (admin) -> `{ success, deleted, failed }`

### Search

- `GET /api/search?q=<term>&limit=<n>` -> `{ songs, total, query }`

### Users

- `GET /api/users` (admin) -> `{ success: true, data: User[] }`
- `GET /api/users/:uid/liked-songs` -> `{ success: true, data: Song[] }`
- `POST /api/users/:uid/liked-songs/:songId` -> `{ success: true, data: string[] }`
- `POST /api/users/:uid/session-picks` -> `{ success: true }`
- `GET /api/users/:uid/playlists` -> `{ success: true, data: Playlist[] }`

### Playlists

- `GET /api/playlists/admin` -> `{ success: true, data: Playlist[] }`
- `GET /api/playlists` (admin) -> `Playlist[]`
- `POST /api/playlists/upload-song` (admin) ->
	- uploaded: `{ status: "uploaded", songId, song }`
	- duplicate: `{ status: "duplicate", songId, existing }`
- `POST /api/playlists/with-cover` (admin) -> `Playlist`
- `POST /api/playlists` (admin) -> `Playlist`
- `DELETE /api/playlists/:id` (admin) -> `{ message: "Playlist deleted successfully" }`

### Artists and albums

- `GET /api/artists/:id` -> `Artist`
- `GET /api/artists/:id/songs?limit=<n>&cursor=<docId>` -> `{ songs, nextCursor, hasMore }`
- `GET /api/albums/:id` -> `Album`
- `GET /api/albums/:id/songs` -> `{ songs, albumId }`

### Error reporting

- `POST /api/errors/report` -> `{ success: true, received: number }`

## Current Rate Limits

- Global: `100 requests / 15 min`
- Search: `30 requests / min`
- Admin song mutations: `20 requests / 15 min`
- Duplicate check: `30 requests / 15 min`
- Artists: `100 requests / 15 min`
- Albums: `100 requests / 15 min`
- Public admin playlists: `60 requests / min`
- Error report ingestion: `20 requests / min`

## Caching and Data Notes

- Backend endpoint caches (node-cache):
	- songs list: 60s
	- song by ID: 300s
	- search: 30s
	- public admin playlists: 120s
	- artist: 600s
	- artist songs: 60s
	- album: 600s
	- album songs: 300s
- Frontend normalizers intentionally defend against mixed API envelopes.
- Song list normalization excludes `audioUrl`; player fetches it on demand by song ID.

## Deployment Notes

### Frontend (Vercel)

- Project root: `client`
- Build command: `npm run build`
- Ensure all `REACT_APP_*` vars are configured

### Backend (Render or similar)

- Project root: `server`
- Start command: `npm start`
- Configure all required env vars
- Set `CLIENT_ORIGIN` to deployed frontend origins
- Verify Firestore indexes before routing production traffic (`FIRESTORE_INDEXES_VERIFIED=true`)

## Known Maintenance Risks

- API envelopes are intentionally mixed; frontend service normalizers are required.
- Some comments are stale relative to runtime values (for example, older limiter wording).
- Server currently contains both class-based and functional service layers under `server/src/services`.
- Contract-level automated tests are thinner than route/middleware complexity.

## Scripts

### Client

- `npm start`
- `npm run build`
- `npm test`

### Server

- `npm run dev`
- `npm start`