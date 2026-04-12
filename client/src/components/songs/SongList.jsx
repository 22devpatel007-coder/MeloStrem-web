/**
 * client/src/components/songs/SongList.jsx
 *
 * UPDATES IN THIS VERSION:
 *
 * ── UPDATE 1: Pass contextSongs + startIndex to SongCard ─────────────────────
 *   The fixed SongContextMenu requires two new props so "Play" can set the full
 *   playback context (queue, shuffle pool, repeat pool) correctly:
 *     - contextSongs {Song[]}  — the full ordered list this song belongs to
 *     - startIndex   {number}  — the position of this song inside contextSongs
 *
 *   SongList is the canonical owner of both pieces of data (it has `songs` and
 *   the loop index `i`), so it is the right place to pass them down.
 *
 *   SongCard must forward these to SongContextMenu:
 *     <SongContextMenu
 *       song={song}
 *       contextSongs={contextSongs}   ← NEW (forwarded from SongList)
 *       startIndex={startIndex}       ← NEW (forwarded from SongList)
 *       onClose={...}
 *       onAddToPlaylist={...}
 *       onDelete={...}
 *       onLike={...}
 *     />
 *
 * ── UPDATE 2: `songList` prop renamed to `contextSongs` inside SongCard call ─
 *   The old prop was named `songList` — kept for backward compat by passing BOTH
 *   names so SongCard can migrate at its own pace without a hard cut:
 *     songList={songs}         ← preserved so existing SongCard code doesn't break
 *     contextSongs={songs}     ← new canonical name for SongContextMenu forwarding
 *
 * ── PRESERVED: all layout, styles, header, empty/loading states — unchanged ──
 */

import SongCard from './SongCard';

/* ── Column header — must mirror SongCard grid columns exactly ─────────────── */
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

// ── SongList ──────────────────────────────────────────────────────────────────
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
              <SongCard
                song={song}
                /*
                 * songList — preserved for backward compat with existing SongCard
                 * code that may still read this prop name internally.
                 */
                songList={songs}
                /*
                 * contextSongs — new canonical name. SongCard should forward this
                 * directly to SongContextMenu so "Play" sets the correct pool.
                 * Both props point to the same array; no extra allocation.
                 */
                contextSongs={songs}
                /*
                 * index / startIndex — both passed so SongCard can use whichever
                 * name it already uses for the row number display (index) while
                 * also having startIndex ready to forward to SongContextMenu.
                 */
                index={i}
                startIndex={i}
              />
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

  .song-list__hcol--index   { text-align: center; }
  .song-list__hcol--cover   { /* spacer */ }
  .song-list__hcol--dur     { text-align: right; }
  .song-list__hcol--actions { /* spacer */ }

  /* Mirror SongCard responsive breakpoints exactly */
  @media (max-width: 1023px) {
    .song-list__header {
      grid-template-columns: 32px 48px 1fr 100px 52px 72px;
    }
    .song-list__hcol--album { display: none; }
  }

  @media (max-width: 639px) {
    /*
     * Fixed 4-column mobile grid — must match SongCard's mobile grid exactly
     * so header columns align with row columns at all viewport widths.
     */
    .song-list__header {
      grid-template-columns: 32px 44px 1fr 72px;
      gap: 8px;
      padding: 0 8px 6px;
    }
    .song-list__hcol--album { display: none; }
    .song-list__hcol--genre { display: none; }
    .song-list__hcol--dur   { display: none; }
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