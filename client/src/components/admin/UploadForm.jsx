/**
 * client/src/pages/AlbumDetail.jsx
 *
 * Album detail page — /album/:id
 *
 * Layout:
 *   Hero  — album cover (large), title, artist name (links to /artist/:artistId),
 *           year, genre, total duration
 *   Track list — SongList-style rows ordered by trackNumber asc
 *   More from this artist — up to 4 other album cards derived from songs data
 *
 * Playback:
 *   Song clicks set context 'library' scoped to the album's full track list.
 *   Play All button starts from track 1.
 *
 * Null safety:
 *   - album.artistId null → artist name renders as plain text (not a link)
 *   - song.trackNumber null → song still renders (sorted last by server)
 *   - 404 from API → friendly not-found state, no crash
 */

import { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAlbum } from '../hooks/useAlbum';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import Navbar from '../components/layout/Navbar';
import Loader from '../components/ui/Loader';

const AlbumDetail = () => {
  const { id } = useParams();
  const { album, songs, isLoading, error } = useAlbum(id);
  const { setPlaybackContext, logPick, currentSong } = usePlayerStore();
  const { user } = useAuthStore();

  const handlePlaySong = useCallback((song, index) => {
    logPick(song, currentSong, user?.uid);
    setPlaybackContext('library', id, songs, index);
  }, [songs, id, setPlaybackContext, logPick, currentSong, user?.uid]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    setPlaybackContext('library', id, songs, 0);
  }, [songs, id, setPlaybackContext]);

  // Total duration from all tracks
  const totalSeconds = songs.reduce((acc, s) => acc + (Number(s.duration) || 0), 0);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) return <Loader />;

  // ── Not found ────────────────────────────────────────────────────────────
  if (!album && !isLoading) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.notFound}>
          <p style={styles.notFoundTitle}>Album not found</p>
          <p style={styles.notFoundSub}>This album page doesn't exist or hasn't been created yet.</p>
          <Link to='/' style={styles.backLink}>← Back to Library</Link>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error && !album) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.notFound}>
          <p style={styles.notFoundTitle}>Could not load album</p>
          <p style={styles.notFoundSub}>Something went wrong. Please try again.</p>
          <Link to='/' style={styles.backLink}>← Back to Library</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          <img
            src={album.coverUrl || 'https://placehold.co/200x200/1a1a1a/555?text=♪'}
            alt={album.name}
            style={styles.heroCover}
            onError={(e) => { e.target.src = 'https://placehold.co/200x200/1a1a1a/555?text=♪'; }}
          />

          <div style={styles.heroMeta}>
            <span style={styles.typeLabel}>ALBUM</span>
            <h1 style={styles.heroName}>{album.name}</h1>

            <div style={styles.heroSub}>
              {/* Artist name — link if artistId present */}
              {album.artistId ? (
                <Link to={`/artist/${album.artistId}`} style={styles.artistLink}>
                  {album.artistName || 'Unknown Artist'}
                </Link>
              ) : (
                <span style={styles.artistText}>{album.artistName || 'Unknown Artist'}</span>
              )}

              {album.year > 0 && <span style={styles.subDivider}>·</span>}
              {album.year > 0 && <span style={styles.subText}>{album.year}</span>}
              {album.genre && <span style={styles.subDivider}>·</span>}
              {album.genre && <span style={styles.genreBadge}>{album.genre}</span>}
            </div>

            <p style={styles.heroStats}>
              {songs.length} {songs.length === 1 ? 'song' : 'songs'}
              {totalSeconds > 0 && ` · ${formatTotalDuration(totalSeconds)}`}
            </p>

            {songs.length > 0 && (
              <button style={styles.playBtn} onClick={handlePlayAll}>▶ Play Album</button>
            )}
          </div>
        </div>
      </div>

      <div style={styles.container}>

        {/* ── Track list ──────────────────────────────────────────────────── */}
        <section style={styles.section}>
          {songs.length === 0 ? (
            <p style={styles.empty}>No tracks found for this album.</p>
          ) : (
            songs.map((song, index) => {
              const isActive = currentSong?.id === song.id;
              return (
                <div
                  key={song.id}
                  style={{
                    ...styles.songRow,
                    background: isActive ? 'rgba(34,197,94,0.06)' : 'transparent',
                  }}
                  onClick={() => handlePlaySong(song, index)}
                >
                  {/* Track number or playing indicator */}
                  <span style={styles.trackNum}>
                    {isActive ? '♪' : (song.trackNumber ?? index + 1)}
                  </span>

                  <img
                    src={song.coverUrl || 'https://placehold.co/40x40/111/555?text=♪'}
                    alt={song.title}
                    style={styles.songCover}
                    onError={(e) => { e.target.src = 'https://placehold.co/40x40/111/555?text=♪'; }}
                  />

                  <div style={styles.songInfo}>
                    <p style={{ ...styles.songTitle, color: isActive ? '#22c55e' : '#fff' }}>
                      {song.title}
                    </p>
                    <p style={styles.songArtist}>{song.artist}</p>
                  </div>

                  {song.genre && <span style={styles.genrePill}>{song.genre}</span>}
                  <span style={styles.duration}>{formatDuration(song.duration)}</span>
                </div>
              );
            })
          )}
        </section>

        {/* ── More from this artist ────────────────────────────────────────── */}
        {album.artistId && (
          <section style={styles.moreSection}>
            <div style={styles.moreTitleRow}>
              <h2 style={styles.sectionTitle}>More by this artist</h2>
              <Link to={`/artist/${album.artistId}`} style={styles.seeAllLink}>
                See all →
              </Link>
            </div>
            <p style={styles.moreHint}>
              Visit the{' '}
              <Link to={`/artist/${album.artistId}`} style={styles.artistLinkInline}>
                {album.artistName || 'artist'}
              </Link>{' '}
              page to explore their full discography.
            </p>
          </section>
        )}

      </div>
      <div style={{ height: 88 }} />
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function formatTotalDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#0f0f0f', fontFamily: "'Inter', sans-serif" },

  // Hero
  hero: { background: 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)', paddingBottom: 32 },
  heroInner: { maxWidth: 1000, margin: '0 auto', padding: '36px 20px 0', display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' },
  heroCover: { width: 200, height: 200, borderRadius: 12, objectFit: 'cover', flexShrink: 0, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' },
  heroMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 },
  typeLabel: { color: '#22c55e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' },
  heroName: { color: '#fff', fontSize: 38, fontWeight: 800, letterSpacing: '-0.8px', lineHeight: 1.1, margin: 0 },
  heroSub: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  artistLink: { color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  artistText: { color: '#fff', fontWeight: 600, fontSize: 14 },
  subDivider: { color: '#4b5563', fontSize: 14 },
  subText: { color: '#9ca3af', fontSize: 14 },
  genreBadge: { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 },
  heroStats: { color: '#6b7280', fontSize: 13, margin: 0 },
  playBtn: { background: '#22c55e', color: '#000', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', marginTop: 4 },

  // Container
  container: { maxWidth: 1000, margin: '0 auto', padding: '0 20px' },
  section: { marginTop: 24 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 16px' },
  empty: { color: '#6b7280', fontSize: 14, padding: '24px 0' },

  // Track rows
  songRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' },
  trackNum: { color: '#6b7280', fontSize: 12, width: 24, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  songCover: { width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 },
  songArtist: { color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 },
  genrePill: { background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500, flexShrink: 0 },
  duration: { color: '#6b7280', fontSize: 12, flexShrink: 0, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  // More section
  moreSection: { marginTop: 48, paddingBottom: 16 },
  moreTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  seeAllLink: { color: '#22c55e', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  moreHint: { color: '#6b7280', fontSize: 13 },
  artistLinkInline: { color: '#9ca3af', fontWeight: 600, textDecoration: 'none' },

  // Not found
  notFound: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, textAlign: 'center' },
  notFoundTitle: { color: '#fff', fontSize: 18, fontWeight: 700 },
  notFoundSub: { color: '#6b7280', fontSize: 14 },
  backLink: { color: '#22c55e', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginTop: 8 },
};

export default AlbumDetail;