/**
 * client/src/pages/admin/UserDetail.jsx
 *
 * Admin-only page. Shows full activity for a single user.
 * Route: /admin/users/:uid  (AdminRoute + PageWrapper in index.jsx)
 *
 * Data sources (all existing endpoints, no new backend needed):
 *   GET /api/users/:uid/recent-plays   → pick history (old + new paths merged)
 *   GET /api/users/:uid/liked-songs    → liked song IDs resolved to Song objects
 *   GET /api/users/:uid/playlists      → playlists created by this user
 *   POST /api/songs/batch              → resolve songIds from picks to Song objects
 *
 * Security:
 *   - AdminRoute in index.jsx blocks non-admins at the route level.
 *   - Backend ownership checks updated to allow req.user.admin bypass
 *     (getLikedSongs line 91, getRecentPlays line 295 in users.controller.js).
 *   - logSessionPicks / toggleLikedSong still strict — admins cannot write
 *     on behalf of users.
 *
 * Old data visibility:
 *   - recent-plays: YES — controller queries both old root sessionPicks
 *     collection and new users/{uid}/sessionPicks subcollection.
 *   - totalSessionPicks: only counts forward from when counter was added.
 *   - playCount on songs: only counts forward.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate }           from 'react-router-dom';
import axiosInstance                        from '../../services/api';
import Loader                               from '../../components/ui/Loader';
import {
  getRecentPlays,
  getLikedSongs,
  getUserPlaylists,
} from '../../services/users.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatTime = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Aggregate picks array → { songId: count } sorted desc
const getMostPlayed = (picks, limit = 10) => {
  const counts = {};
  for (const pick of picks) {
    if (pick.songId) counts[pick.songId] = (counts[pick.songId] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([songId, count]) => ({ songId, count }));
};

// Resolve a list of songIds to Song objects via POST /api/songs/batch
// Returns a Map<songId, Song> for O(1) lookup
const resolveSongs = async (songIds) => {
  if (!songIds.length) return new Map();
  const unique = [...new Set(songIds)].slice(0, 100); // batch cap safety
  try {
    const res  = await axiosInstance.post('/songs/batch', { ids: unique });
    const songs = Array.isArray(res?.data?.data) ? res.data.data : [];
    const map  = new Map();
    for (const s of songs) if (s?.id) map.set(s.id, s);
    return map;
  } catch {
    return new Map();
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ label, value }) => (
  <div style={s.statCard}>
    <p style={s.statLabel}>{label}</p>
    <p style={s.statValue}>{value ?? '—'}</p>
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 style={s.sectionTitle}>{children}</h2>
);

const EmptyRow = ({ text }) => (
  <p style={s.empty}>{text}</p>
);

const SongRow = ({ rank, song, songId, right }) => {
  const title  = song?.title  || songId;
  const artist = song?.artist || null;
  const cover  = song?.coverUrl || null;

  return (
    <div style={s.songRow}>
      {rank != null && <span style={s.rank}>{rank}</span>}
      <div style={s.songAvatar}>
        {cover
          ? <img src={cover} alt="" style={s.songCover} onError={(e) => { e.target.style.display = 'none'; }} />
          : <span style={s.songInitial}>{(title[0] || '?').toUpperCase()}</span>
        }
      </div>
      <div style={s.songInfo}>
        <p style={s.songTitle}>{title}</p>
        {artist && <p style={s.songArtist}>{artist}</p>}
      </div>
      {right && <span style={s.songRight}>{right}</span>}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const UserDetail = () => {
  const { uid }    = useParams();
  const navigate   = useNavigate();

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [picks,     setPicks]     = useState([]);   // raw pick objects
  const [liked,     setLiked]     = useState([]);   // Song[]
  const [playlists, setPlaylists] = useState([]);   // Playlist[]
  const [songMap,   setSongMap]   = useState(new Map()); // songId → Song
  const [tab,       setTab]       = useState('recent'); // recent | most | liked | playlists

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    try {
      const [rawPicks, likedSongs, userPlaylists] = await Promise.all([
        getRecentPlays(uid, 50),
        getLikedSongs(uid),
        getUserPlaylists(uid),
      ]);

      const safePicks     = Array.isArray(rawPicks)     ? rawPicks     : [];
      const safeLiked     = Array.isArray(likedSongs)   ? likedSongs   : [];
      const safePlaylists = Array.isArray(userPlaylists) ? userPlaylists : [];

      setPicks(safePicks);
      setLiked(safeLiked);
      setPlaylists(safePlaylists);

      // Resolve all unique songIds from picks to full Song objects
      const pickSongIds  = safePicks.map((p) => p.songId).filter(Boolean);
      const likedSongIds = safeLiked.map((s) => s.id).filter(Boolean);
      const allIds       = [...new Set([...pickSongIds, ...likedSongIds])];
      const map          = await resolveSongs(allIds);
      setSongMap(map);
    } catch (err) {
      setError('Failed to load user activity. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const mostPlayed   = getMostPlayed(picks, 10);
  const recentPicks  = [...picks]
    .sort((a, b) => new Date(b.pickedAt || 0) - new Date(a.pickedAt || 0))
    .slice(0, 20);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <Loader />;

  if (error) {
    return (
      <div style={s.container}>
        <button style={s.back} onClick={() => navigate('/admin/users')}>← Back</button>
        <p style={s.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div style={s.container}>

      {/* ── Back ── */}
      <button style={s.back} onClick={() => navigate('/admin/users')}>
        ← Back to users
      </button>

      {/* ── UID header ── */}
      <div style={s.pageHeader}>
        <div style={s.uidAvatar}>
          {(uid[0] || '?').toUpperCase()}
        </div>
        <div>
          <p style={s.uidLabel}>User ID</p>
          <p style={s.uidValue}>{uid}</p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={s.statsRow}>
        <StatCard label="Total picks (recorded)"  value={picks.length} />
        <StatCard label="Liked songs"             value={liked.length} />
        <StatCard label="Playlists created"       value={playlists.length} />
        <StatCard label="Unique songs played"     value={new Set(picks.map(p => p.songId).filter(Boolean)).size} />
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        {[
          { key: 'recent',    label: `Recent plays (${recentPicks.length})` },
          { key: 'most',      label: `Most played (${mostPlayed.length})` },
          { key: 'liked',     label: `Liked songs (${liked.length})` },
          { key: 'playlists', label: `Playlists (${playlists.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={s.tabContent}>

        {/* Recent plays */}
        {tab === 'recent' && (
          recentPicks.length === 0
            ? <EmptyRow text="No play history found." />
            : recentPicks.map((pick, i) => (
                <SongRow
                  key={`${pick.songId}-${i}`}
                  song={songMap.get(pick.songId)}
                  songId={pick.songId}
                  right={formatTime(pick.pickedAt)}
                />
              ))
        )}

        {/* Most played */}
        {tab === 'most' && (
          mostPlayed.length === 0
            ? <EmptyRow text="No play history found." />
            : mostPlayed.map(({ songId, count }, i) => (
                <SongRow
                  key={songId}
                  rank={i + 1}
                  song={songMap.get(songId)}
                  songId={songId}
                  right={`${count} play${count !== 1 ? 's' : ''}`}
                />
              ))
        )}

        {/* Liked songs */}
        {tab === 'liked' && (
          liked.length === 0
            ? <EmptyRow text="No liked songs." />
            : liked.map((song, i) => (
                <SongRow
                  key={song.id || i}
                  song={song}
                  songId={song.id}
                />
              ))
        )}

        {/* Playlists */}
        {tab === 'playlists' && (
          playlists.length === 0
            ? <EmptyRow text="No playlists created." />
            : playlists.map((pl, i) => (
                <div key={pl.id || i} style={s.playlistRow}>
                  <div style={s.playlistIcon}>♪</div>
                  <div style={s.songInfo}>
                    <p style={s.songTitle}>{pl.name || pl.title || 'Untitled playlist'}</p>
                    <p style={s.songArtist}>
                      {pl.songs?.length ?? 0} song{(pl.songs?.length ?? 0) !== 1 ? 's' : ''}
                      {pl.createdAt ? ` · Created ${formatDate(pl.createdAt)}` : ''}
                    </p>
                  </div>
                </div>
              ))
        )}

      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container: {
    maxWidth:   '860px',
    margin:     '0 auto',
    padding:    '28px 20px 80px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  back: {
    background:  'none',
    border:      'none',
    color:       '#6b7280',
    fontSize:    '13px',
    cursor:      'pointer',
    padding:     '0 0 20px 0',
    display:     'block',
    fontFamily:  'inherit',
  },
  pageHeader: {
    display:       'flex',
    alignItems:    'center',
    gap:           '14px',
    marginBottom:  '24px',
  },
  uidAvatar: {
    width:          '44px',
    height:         '44px',
    borderRadius:   '10px',
    background:     '#1e2a1e',
    border:         '1px solid #22c55e22',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#22c55e',
    fontSize:       '18px',
    fontWeight:     '700',
    flexShrink:     0,
  },
  uidLabel: { color: '#4b5563', fontSize: '11px', marginBottom: '2px' },
  uidValue: {
    color:      '#fff',
    fontSize:   '13px',
    fontFamily: 'monospace',
    wordBreak:  'break-all',
  },
  statsRow: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap:                 '10px',
    marginBottom:        '24px',
  },
  statCard: {
    background:   '#1a1a1a',
    border:       '1px solid #2d2d2d',
    borderRadius: '10px',
    padding:      '14px 16px',
  },
  statLabel: { color: '#4b5563', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  statValue: { color: '#fff', fontSize: '22px', fontWeight: '700' },
  tabs: {
    display:        'flex',
    gap:            '4px',
    marginBottom:   '16px',
    flexWrap:       'wrap',
  },
  tab: {
    background:   'transparent',
    border:       '1px solid #2d2d2d',
    borderRadius: '6px',
    color:        '#6b7280',
    fontSize:     '12px',
    padding:      '6px 12px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'all 0.15s',
  },
  tabActive: {
    background:  '#1e2a1e',
    border:      '1px solid #22c55e44',
    color:       '#22c55e',
  },
  tabContent: {
    background:   '#1a1a1a',
    border:       '1px solid #2d2d2d',
    borderRadius: '12px',
    overflow:     'hidden',
  },
  sectionTitle: {
    color:        '#fff',
    fontSize:     '14px',
    fontWeight:   '600',
    padding:      '14px 16px 0',
    marginBottom: '8px',
  },
  empty: {
    color:     '#4b5563',
    fontSize:  '13px',
    padding:   '32px 16px',
    textAlign: 'center',
  },
  errorText: {
    color:    '#ef4444',
    fontSize: '14px',
  },
  songRow: {
    display:       'flex',
    alignItems:    'center',
    gap:           '12px',
    padding:       '10px 16px',
    borderBottom:  '1px solid #1f1f1f',
  },
  rank: {
    color:     '#4b5563',
    fontSize:  '12px',
    width:     '18px',
    textAlign: 'right',
    flexShrink: 0,
  },
  songAvatar: {
    width:          '36px',
    height:         '36px',
    borderRadius:   '6px',
    background:     '#2d2d2d',
    flexShrink:     0,
    overflow:       'hidden',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  songCover: {
    width:      '100%',
    height:     '100%',
    objectFit:  'cover',
  },
  songInitial: {
    color:      '#6b7280',
    fontSize:   '14px',
    fontWeight: '700',
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: {
    color:         '#fff',
    fontSize:      '13px',
    fontWeight:    '500',
    whiteSpace:    'nowrap',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
  },
  songArtist: {
    color:        '#6b7280',
    fontSize:     '11px',
    marginTop:    '2px',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  songRight: {
    color:      '#4b5563',
    fontSize:   '11px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  playlistRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          '12px',
    padding:      '10px 16px',
    borderBottom: '1px solid #1f1f1f',
  },
  playlistIcon: {
    width:          '36px',
    height:         '36px',
    borderRadius:   '6px',
    background:     '#1e2a1e',
    border:         '1px solid #22c55e22',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#22c55e',
    fontSize:       '16px',
    flexShrink:     0,
  },
};

export default UserDetail;