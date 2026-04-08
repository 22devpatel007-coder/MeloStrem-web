/**
 * client/src/components/songs/SongList.jsx
 *
 * UI UPDATE: Wraps SongCard rows in a vertical list container.
 * - Passes `index` prop to each SongCard so row numbers render correctly.
 * - Adds a column header row so users can orient themselves in the layout.
 * - Empty state and loading state preserved from original.
 * - Zero logic changes — songs prop contract unchanged.
 */

import SongCard from './SongCard';

/* ── Column header — matches SongCard grid columns exactly ─────────────────── */
const ListHeader = () => (
  <>
    <style>{HEADER_STYLES}</style>
    <div className="song-list__header" aria-hidden="true">
      <span className="song-list__hcol song-list__hcol--index">#</span>
      <span className="song-list__hcol song-list__hcol--cover" />
      <span className="song-list__hcol">Title</span>
      <span className="song-list__hcol song-list__hcol--album">Album</span>
      <span className="song-list__hcol song-list__hcol--genre">Genre</span>
      <span className="song-list__hcol song-list__hcol--dur">Time</span>
      <span className="song-list__hcol song-list__hcol--actions" />
    </div>
    <div className="song-list__divider" />
  </>
);

const SongList = ({ songs }) => {
  if (!songs || songs.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>♪</div>
        <p style={styles.emptyTitle}>No songs found</p>
        <p style={styles.emptySubtitle}>Try a different search or check back later.</p>
      </div>
    );
  }

  return (
    <>
      <style>{LIST_STYLES}</style>
      <div className="song-list">
        <ListHeader />
        <div className="song-list__rows" role="list">
          {songs.map((song, i) => (
            <div key={song.id} role="listitem">
              <SongCard song={song} songList={songs} index={i} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

/* ── Styles ─────────────────────────────────────────────────────────────────── */
const LIST_STYLES = `
  .song-list {
    width: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .song-list__rows {
    display: flex;
    flex-direction: column;
  }

  .song-list__divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 0 12px 4px;
  }
`;

const HEADER_STYLES = `
  .song-list__header {
    display: grid;
    grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
    align-items: center;
    gap: 12px;
    padding: 0 12px 8px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .song-list__hcol {
    font-size: 11px;
    font-weight: 600;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-list__hcol--index  { text-align: center; }
  .song-list__hcol--cover  { /* spacer */ }
  .song-list__hcol--dur    { text-align: right; }
  .song-list__hcol--actions { /* spacer */ }

  /* Mirror SongCard responsive breakpoints */
  @media (max-width: 1023px) {
    .song-list__header {
      grid-template-columns: 32px 48px 1fr 100px 52px 72px;
    }
    .song-list__hcol--album { display: none; }
  }

  @media (max-width: 639px) {
    .song-list__header {
      grid-template-columns: 32px 44px 1fr 48px 64px;
      gap: 8px;
      padding: 0 8px 6px;
    }
    .song-list__hcol--album { display: none; }
    .song-list__hcol--genre { display: none; }
  }
`;

const styles = {
  empty: {
    textAlign: 'center',
    padding: '80px 20px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  emptyIcon: {
    width: '56px',
    height: '56px',
    background: '#1a1a1a',
    border: '1px solid #2d2d2d',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    margin: '0 auto 16px',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '6px',
  },
  emptySubtitle: {
    color: '#6b7280',
    fontSize: '14px',
  },
};

export default SongList;