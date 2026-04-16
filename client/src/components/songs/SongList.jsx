/**
 * client/src/components/songs/SongList.jsx
 *
 * Task 3.5 — List Virtualization for 10,000+ Songs
 *
 * WHAT CHANGED (surgical — everything else preserved):
 *
 *   1. @tanstack/react-virtual added for row virtualization.
 *      Only songs currently in the viewport + overscan=5 are in the DOM.
 *      Memory stays flat at 10,000+ songs.
 *
 *   2. useRef(null) → containerRef on the scrollable `.song-list__rows` div.
 *      useVirtualizer is anchored to this container.
 *
 *   3. estimateSize: () => 61  — matches .song-row min-height (60px) + 1px
 *      border-top divider. Keeps virtual scroll offsets pixel-accurate.
 *
 *   4. overscan: 5 — 5 rows above/below viewport rendered. Prevents flash of
 *      blank rows on fast scroll without wasting DOM nodes.
 *
 *   5. The outer `.song-list__rows` div gets an explicit height equal to
 *      virtualizer.getTotalSize() so the scrollbar thumb is correctly sized.
 *      Each rendered row is absolutely positioned via virtualizer.getVirtualItems().
 *
 *   6. SongCard receives `virtualIndex` (= virtualItem.index) as `index` and
 *      `startIndex` so the row number and playback pool index stay correct.
 *
 *   7. Infinite scroll sentinel: when the last virtualItem.index reaches
 *      songs.length - SENTINEL_OFFSET (10 rows from end), fetchNextPage() fires.
 *      fetchNextPage + hasNextPage + isFetchingNextPage are optional props —
 *      SongList works standalone (library) or embedded (search, artist).
 *      isFetchingNextPage renders SongListSkeleton rows at the bottom.
 *
 * WHAT DID NOT CHANGE:
 *   - ListHeader — identical, position above the virtualized scroll region
 *   - Empty state — identical
 *   - SongCard props (song, songList, contextSongs, index, startIndex) — identical
 *   - LIST_STYLES / HEADER_STYLES — identical
 *   - All className values — identical
 */

import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import SongCard from './SongCard';
import SongListSkeleton from './SongListSkeleton';

// ── Constants ─────────────────────────────────────────────────────────────────
/**
 * Must match `.song-row` min-height (60px) + `.song-row + .song-row` border-top (1px).
 * If SongCard row height changes, update this value to match.
 */
const SONG_ROW_HEIGHT = 61;

/**
 * Number of extra rows rendered above and below the visible viewport.
 * 5 rows = ~305px buffer — enough for fast scroll without flash.
 */
const OVERSCAN = 5;

/**
 * How many rows from the bottom of loaded data triggers the next page fetch.
 * 10 rows = ~610px ahead of the last song — user never sees a loading gap.
 */
const SENTINEL_OFFSET = 10;

// ── Column header — must mirror SongCard grid columns exactly ─────────────────
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
/**
 * @param {object}   props
 * @param {Song[]}   props.songs                — flat array of all loaded songs
 * @param {Function} [props.fetchNextPage]       — from useInfiniteQuery / useSongs
 * @param {boolean}  [props.hasNextPage]         — whether more pages exist
 * @param {boolean}  [props.isFetchingNextPage]  — skeleton shown when true
 */
const SongList = ({
  songs,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}) => {
  // ── Ref anchors the virtualizer to the scrollable rows container ────────────
  const containerRef = useRef(null);

  // ── Virtualizer ─────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count:        songs?.length ?? 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SONG_ROW_HEIGHT,
    overscan:     OVERSCAN,
  });

  const virtualItems  = virtualizer.getVirtualItems();
  const totalHeight   = virtualizer.getTotalSize();

  // ── Infinite scroll trigger ──────────────────────────────────────────────────
  // When the last rendered virtual item is within SENTINEL_OFFSET rows of the
  // end of the loaded data, fetch the next page.
  useEffect(() => {
    if (!fetchNextPage || !hasNextPage || isFetchingNextPage) return;
    if (virtualItems.length === 0) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= (songs.length - SENTINEL_OFFSET)) {
      fetchNextPage();
    }
  }, [virtualItems, songs?.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ── Empty state ──────────────────────────────────────────────────────────────
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
        {/* Header stays above the scroll region — not virtualized */}
        <ListHeader />

        {/*
          * Scrollable container — the virtualizer's getScrollElement() target.
          * max-height is set to a viewport-relative value so the list is
          * scrollable within PageWrapper's own scroll region.
          * overflow-y: auto enables the browser scrollbar that the virtualizer measures.
          */}
        <div
          ref={containerRef}
          className="song-list__rows"
          role="list"
          style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}
        >
          {/*
            * Spacer div — total virtual height. The scrollbar thumb is sized by this.
            * position: relative so absolutely-positioned virtual rows are anchored here.
            */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            {virtualItems.map((virtualItem) => {
              const song = songs[virtualItem.index];
              if (!song) return null;

              return (
                <div
                  key={song.id}
                  role="listitem"
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top:    0,
                    left:   0,
                    width:  '100%',
                    // transform moves each row to its virtual Y position.
                    // Using transform (not top) is the correct pattern for
                    // @tanstack/react-virtual — avoids layout thrash.
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <SongCard
                    song={song}
                    /*
                     * Both prop names passed — see SongList previous version notes.
                     * songList    → backward compat
                     * contextSongs → canonical name for SongContextMenu pool
                     */
                    songList={songs}
                    contextSongs={songs}
                    index={virtualItem.index}
                    startIndex={virtualItem.index}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Loading skeleton for the next page — shown below the list */}
        {isFetchingNextPage && (
          <div style={{ marginTop: 4 }}>
            <SongListSkeleton count={4} />
          </div>
        )}
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

  /*
   * Rows container — overflow-y: auto is set inline (required for virtualizer).
   * flex-direction is preserved for non-virtualized use, but in the virtualized
   * path rows are absolutely positioned inside the spacer div.
   */
  .song-list__rows {
    display: flex;
    flex-direction: column;
  }

  .song-list__divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 0 12px 4px;
  }

  /* Hide scrollbar visually but keep it functional (virtualizer needs it) */
  .song-list__rows::-webkit-scrollbar { width: 4px; }
  .song-list__rows::-webkit-scrollbar-track { background: transparent; }
  .song-list__rows::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
  }
  .song-list__rows::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.14);
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